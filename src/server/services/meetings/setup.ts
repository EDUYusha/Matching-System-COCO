import { config, l, numberToCredits } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { AppError, InteractorFailure } from '@/server/lib/errors';
import { createSystemMessage, systemMessageToUser } from '@/server/services/messages';
import { findConversationWithPartner } from '@/server/services/conversations';
import { assertNoNegativeBalance } from '@/server/services/credits';
import { isBookable } from '@/server/services/users';
import {
  enqueueAutoOpenMeeting,
  enqueueMeetingBroadcast,
  enqueueRemindMeetingArrival,
  enqueueRemindMeetingStart,
  enqueueRemindSelectionEnd,
} from '@/server/jobs/queues';
import { estimatedCosts, meetingAreaName, type MeetingLike } from '@/server/services/meetings/model';

/**
 * Ports SetUpMeeting (CheckCreditBalance + RequestMeeting),
 * SetUpIndividualMeeting and SetUpIndividualMeetingRequest — the three ways an
 * order comes into existence.
 */

/**
 * RequestMeeting's recruitment window. The closer the order is to starting, the
 * shorter cast have to respond, so a 30-minutes-out order closes in 10 minutes
 * while one three days out stays open a full day.
 */
export function computeRequestEndTime(plannedStartTime: Date, requestStartTime: Date): Date {
  const minutes = (n: number) => new Date(requestStartTime.getTime() + n * 60 * 1000);
  const timeUntilStart = (plannedStartTime.getTime() - requestStartTime.getTime()) / 1000;

  if (timeUntilStart <= 30 * 60) return minutes(10);
  if (timeUntilStart <= 2 * 3600) return minutes(15);
  if (timeUntilStart <= 6 * 3600) return minutes(30);
  if (timeUntilStart <= 12 * 3600) return minutes(60);
  if (timeUntilStart <= 24 * 3600) return minutes(4 * 60);
  if (timeUntilStart <= 72 * 3600) return minutes(8 * 60);
  return minutes(24 * 60);
}

export interface SetUpMeetingOptions {
  /** MeetingBroadcastWorker scope: null | 'all' | 'available' | 'none' */
  castNotification?: string | null;
  noCustomerNotification?: boolean;
}

/** SetUpMeeting — a group order going out to recruitment. */
export async function setUpMeeting(meetingId: number, options: SetUpMeetingOptions = {}): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { area: true, castRank: true },
  });

  // CheckCreditBalance
  await assertNoNegativeBalance(meeting.ownerId);

  // RequestMeeting
  const requestStartTime = meeting.requestStartTime ?? new Date();
  const requestEndTime = meeting.requestEndTime ?? computeRequestEndTime(meeting.plannedStartTime, requestStartTime);

  if (Date.now() > requestEndTime.getTime()) {
    throw new InteractorFailure("It's too late to start now");
  }

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { requestStartTime, requestEndTime },
  });

  if (!options.noCustomerNotification) {
    await systemMessageToUser(meeting.ownerId, {
      content: `ご予約のリクエストありがとうございます。
現在合流可能なキャストをお探ししています。
尚リクエスト確定後のキャンセルはお受けできません。予めご了承ください。

場所 : ${meetingAreaName(meeting as MeetingLike)}
時間 : ${l(meeting.plannedStartTime)} ~ ${l(meeting.plannedEndTime)}
人数 : ${meeting.neededPersonCount}人${meeting.minimumPersonCount ? `（最低${meeting.minimumPersonCount}人）` : ''}
`,
    });
  }

  await enqueueMeetingBroadcast(meeting.id, options.castNotification ?? null);
  await enqueueAutoOpenMeeting(meeting.id, requestEndTime);
  await enqueueRemindSelectionEnd(
    meeting.id,
    new Date(requestEndTime.getTime() - config.remind_time_before_selection_end * 1000),
  );
}

/**
 * SetUpIndividualMeeting — the guest asks one specific cast, inside their
 * existing private chat. The request stays open until 20 seconds before the
 * order would start.
 */
export async function setUpIndividualMeeting(
  meetingId: number,
  castId: number,
  tx?: Tx,
): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { area: true, owner: { select: { id: true, creditBalance: true } } },
  });

  const cast = await client.user.findUnique({
    where: { id: castId },
    select: { id: true, userType: true, accessLevel: true, orderFeePerTime: true, discardedAt: true },
  });
  if (!cast || cast.discardedAt) throw new InteractorFailure('Could not find cast');
  if (cast.userType !== 'cast') throw new InteractorFailure('User is no cast');
  if (cast.orderFeePerTime === null) throw new InteractorFailure('Cast has currently no fee set up');
  // the profile hides the booking button for these, but the request can be sent directly
  if (!isBookable(cast)) throw new InteractorFailure('Cast is currently not bookable');

  const sharedConversationId = await findConversationWithPartner(meeting.ownerId, cast.id, { onlyPrivate: true });
  if (!sharedConversationId) throw new InteractorFailure('No shared private chat room found');

  const requestEndTime = new Date(meeting.plannedStartTime.getTime() - 20 * 1000);
  if (Date.now() > requestEndTime.getTime()) {
    throw new InteractorFailure("It's too late to start now");
  }
  if (meeting.owner.creditBalance < 0) {
    throw new InteractorFailure('Cannot start meeting when unsettled purchases are present');
  }

  const baseCosts = cast.orderFeePerTime;

  await transaction(tx, async (t) => {
    await t.meeting.update({
      where: { id: meeting.id },
      data: {
        requestStartTime: new Date(),
        requestEndTime,
        baseCostPerTime: baseCosts,
        prolongCostPerTime: Math.floor(
          (baseCosts * config.individual_meeting_prolong_multiplier_permille) / 1000,
        ),
        conversationId: sharedConversationId,
      },
    });
    await t.castAttendance.create({
      data: { meetingId: meeting.id, userId: cast.id, role: 'requested', decisionBy: 'customer' },
    });
  });

  // closes the request if it is not accepted in time
  await enqueueAutoOpenMeeting(meeting.id, requestEndTime);

  await createSystemMessage({
    conversationId: sharedConversationId,
    withUnread: false,
    withBroadcast: true,
    content: `個cocoのリクエスト、
ありがとうございます😊

キャストさんからの返答をお待ちください。

尚リクエスト確定後のキャンセルはお受けできません。予めご了承ください。
0時以降の深夜手当は含まれてないのでゲストさんキャストさん当人同士でご確認下さい。

  場所 : ${meetingAreaName(meeting as MeetingLike)}
  時間 : ${l(meeting.plannedStartTime)} ~ ${l(meeting.plannedEndTime)}
  <a href="/meetings/${meeting.id}/request" class="message_room_cast_select_btn">詳細はこちら</a>
`,
  });
}

/**
 * SetUpIndividualMeetingRequest — the mirror image: a cast proposes an order to
 * a guest. The attendance row already exists (the form builds it), so this only
 * wires up the conversation, the timeout and the notification.
 */
export async function setUpIndividualMeetingRequest(meetingId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      area: true,
      castRank: true,
      owner: { select: { id: true, creditBalance: true } },
      castAttendances: { orderBy: { id: 'asc' }, take: 1, include: { user: { select: { id: true } } } },
    },
  });

  const cast = meeting.castAttendances[0]?.user;
  if (!cast) throw new InteractorFailure('Could not find cast');
  if (meeting.baseCostPerTime === null || meeting.prolongCostPerTime === null) {
    throw new InteractorFailure('Meeting costs are not set');
  }

  const sharedConversationId = await findConversationWithPartner(meeting.ownerId, cast.id, { onlyPrivate: true });
  if (!sharedConversationId) throw new InteractorFailure('No shared private chat room found');

  const requestEndTime = new Date(meeting.plannedStartTime.getTime() - 20 * 1000);
  if (Date.now() > requestEndTime.getTime()) {
    throw new InteractorFailure("It's too late to start now");
  }
  if (meeting.owner.creditBalance < 0) {
    throw new InteractorFailure('Cannot start meeting when unsettled purchases are present');
  }

  await client.meeting.update({
    where: { id: meeting.id },
    data: { requestStartTime: new Date(), requestEndTime, conversationId: sharedConversationId },
  });

  await enqueueAutoOpenMeeting(meeting.id, requestEndTime);

  await createSystemMessage({
    conversationId: sharedConversationId,
    withUnread: false,
    withBroadcast: true,
    content: `個cocoのリクエストが
キャストさんから届きました💖

ゲストさんの承認があるまで確定ではないので、承認をお早めにお願い致します🙇‍♀️🙇‍♂️
なお、個cocoは0時以降の深夜料金はございません。


  場所 : ${meetingAreaName(meeting as MeetingLike)}
  時間 : ${l(meeting.plannedStartTime)} ~ ${l(meeting.plannedEndTime)}
  料金 : ${numberToCredits(estimatedCosts(meeting as MeetingLike))}
  <a href="/meetings/${meeting.id}/request" class="message_room_cast_select_btn">詳細はこちら</a>

※既読されているに承認をされない場合、
キャストさんは承認される前にはキャンセル可能ですので、その場合にはリクエストを取り消し、その旨をお伝え下さい❣️
`,
  });
}

/**
 * Schedules the two optional start-of-order reminders. Both are disabled in the
 * live configuration (remind_time_before/after_meeting_start are nil), but the
 * call sites are kept so flipping the config works.
 */
export async function scheduleStartReminders(meeting: { id: number; plannedStartTime: Date }): Promise<void> {
  if (config.remind_time_before_meeting_start) {
    await enqueueRemindMeetingStart(
      meeting.id,
      new Date(meeting.plannedStartTime.getTime() - config.remind_time_before_meeting_start * 1000),
    );
  }
  if (config.remind_time_after_meeting_start) {
    await enqueueRemindMeetingArrival(
      meeting.id,
      new Date(meeting.plannedStartTime.getTime() + config.remind_time_after_meeting_start * 1000),
    );
  }
}

/** Guard shared by the order forms: the guest must have a usable card. */
export async function assertCanOrder(userId: number): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { userType: true, creditcardToken: true, creditBalance: true },
  });
  if (user.userType === 'operator' || user.userType === 'admin') return;

  const hasCard = !!user.creditcardToken && !user.creditcardToken.startsWith('!');
  if (!hasCard) {
    throw new AppError(
      'サービスのご利用にはクレジットカードの情報入力が必要です。マイページの「お支払い情報」からカード情報をご入力下さい。',
      { redirect: '/financial/credit_card' },
    );
  }
  if (user.creditBalance < 0) {
    throw new AppError(
      'まだ未決済の項目があるから新しい合流ができません。間違いと思えば管理者にご連絡ください。',
      { redirect: '/financial/credit_card' },
    );
  }
}
