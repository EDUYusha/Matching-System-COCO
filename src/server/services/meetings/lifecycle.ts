import { AN, config, l, lShortWithWeekday, numberToCredits, PATRON_SHARE_PERMILLE, type MeetingCosts } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';
import { InteractorFailure } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { beginningOfMinute } from '@/lib';
import { createCreditTransaction, freezeCredits } from '@/server/services/credits';
import { buyCredits } from '@/server/services/buy-credits';
import { createSystemMessage, systemMessageToUser } from '@/server/services/messages';
import {
  firstMeetingEndSendMessage,
  firstMeetingSendMessage,
  meetingCompleteAttendanceForCast,
} from '@/server/services/auto-send-message';
import {
  enqueueMessageBroadcast,
  enqueueOpenReviewModal,
  enqueueRemindMeetingEnd,
} from '@/server/jobs/queues';
import {
  rewardAttendance,
  rewardCast,
  rewardInviters,
  rewardPatron,
  rewardUsage,
  updateCastRepeatCounts,
} from '@/server/services/rewards';
import { attendanceEarnings, calculateCostsFor, calculateMeetingCosts } from '@/server/services/meetings/costs';
import { estimatedCosts, finalCostsUpdate, plannedLength, type MeetingLike } from '@/server/services/meetings/model';
import { finalizeMeetingFinances, MeetingFinanceFailure } from '@/server/services/meetings/finances';
import { scheduleStartReminders } from '@/server/services/meetings/setup';

/**
 * Ports the interactors that move an order from scheduled through to paid:
 * CastArriveAtMeeting, StartMeeting, CastFinishMeeting, MarkMeetingFinished,
 * CreateMeetingTransactions, MarkMeetingCompleted and the CompleteMeeting
 * organizer, plus the three individual-order accept/refuse interactors.
 */

/** CastArriveAtMeeting — the cast presses 開始 on arrival. */
export async function castArriveAtMeeting(castAttendanceId: number): Promise<void> {
  const attendance = await prisma.castAttendance.findUniqueOrThrow({
    where: { id: castAttendanceId },
    include: {
      meeting: { select: { id: true, conversationId: true, plannedStartTime: true, plannedEndTime: true } },
      user: { select: { id: true, nickName: true, serviceFeePermille: true } },
    },
  });

  if (attendance.startTime !== null) throw new InteractorFailure('Start time is already set');

  const startTime = beginningOfMinute(new Date());
  await prisma.castAttendance.update({
    where: { id: attendance.id },
    data: {
      startTime,
      // do not overwrite a rate an operator set by hand
      ...(attendance.serviceFeePermille === null
        ? { serviceFeePermille: attendance.user.serviceFeePermille }
        : {}),
    },
  });

  if (attendance.meeting.conversationId) {
    await createSystemMessage({
      conversationId: attendance.meeting.conversationId,
      content: `${attendance.user.nickName}さんは合流しました。`,
      withBroadcast: true,
    });
  }

  // Schedule the end-of-order reminder against this cast's own clock when their
  // billing window depends on when they arrived.
  const diff = config.remind_time_before_meeting_end;
  if (
    diff &&
    (startTime.getTime() > attendance.meeting.plannedStartTime.getTime() ||
      config.costs_for_being_early ||
      config.only_consider_attendance_time_spans_for_costs)
  ) {
    const remindTime = new Date(startTime.getTime() + plannedLength(attendance.meeting) * 1000 - diff * 1000);
    await enqueueRemindMeetingEnd(attendance.meeting.id, attendance.id, remindTime);
  }
}

/** StartMeeting — flips the order to in_progress once the first cast arrives. */
export async function startMeeting(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (meeting.status !== 'scheduled') {
    throw new InteractorFailure(`Meeting wasn't scheduled, its status is '${meeting.status}'`);
  }

  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'in_progress' } });

  // A single shared reminder is enough when arrival time does not affect billing.
  const diff = config.remind_time_before_meeting_end;
  if (diff && !(config.costs_for_being_early || config.only_consider_attendance_time_spans_for_costs)) {
    await enqueueRemindMeetingEnd(meetingId, null, new Date(meeting.plannedEndTime.getTime() - diff * 1000));
  }
}

/** CastFinishMeeting — the cast presses 解散. */
export async function castFinishMeeting(castAttendanceId: number, endTime?: Date | null): Promise<void> {
  const attendance = await prisma.castAttendance.findUniqueOrThrow({
    where: { id: castAttendanceId },
    include: {
      meeting: { select: { id: true, conversationId: true } },
      user: { select: { id: true, nickName: true, userType: true, inviterId: true } },
    },
  });

  if (attendance.endTime !== null) throw new InteractorFailure('End time is already set');

  await prisma.castAttendance.update({
    where: { id: attendance.id },
    data: { endTime: endTime ?? beginningOfMinute(new Date()) },
  });

  if (attendance.meeting.conversationId) {
    const message = await createSystemMessage({
      conversationId: attendance.meeting.conversationId,
      content: `${attendance.user.nickName}さんは解散しました。`,
      withBroadcast: true,
    });
    // The original also enqueued the broadcast explicitly here, on top of the
    // model's after_commit, to be sure the LINE notification went out.
    logger.info({ messageId: message.id }, 'CastFinishMeeting: message created');
  }

  const settledCount = await prisma.meeting.count({
    where: {
      status: { in: ['completed', 'finished', 'post_charge_fail'] },
      castAttendances: { some: { userId: attendance.userId, role: { not: 'out' } } },
    },
  });
  if (settledCount === 0) {
    await firstMeetingEndSendMessage({
      id: attendance.user.id,
      nickName: attendance.user.nickName,
      userType: attendance.user.userType,
      inviterId: attendance.user.inviterId,
    });
  }
}

export interface MarkMeetingFinishedOptions {
  costs?: MeetingCosts;
  endTime?: Date | null;
  noMessages?: boolean;
  noReviewMessages?: boolean;
  finishMessage?: string | null;
}

/**
 * MarkMeetingFinished — sets the final cost, marks the order finished and sends
 * the two long wrap-up messages (guest receipt summary, cast earnings + review
 * prompt), then asks both sides' clients to open the review dialog.
 */
export async function markMeetingFinished(
  meetingId: number,
  options: MarkMeetingFinishedOptions = {},
): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { castRank: true, area: true },
  });
  const costs = options.costs ?? (await calculateMeetingCosts(meetingId));
  const endTime = options.endTime ?? new Date();

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { ...finalCostsUpdate(meeting, costs.total), status: 'finished', realEndTime: endTime },
  });

  if (options.noMessages) return;

  if (meeting.conversationId) {
    const finishMessage = options.finishMessage ?? '終了しました。';
    await createSystemMessage({
      conversationId: meeting.conversationId,
      content: finishMessage,
      withBroadcast: true,
    });
  }

  await systemMessageToUser(meeting.ownerId, {
    withBroadcast: true,
    withUnread: true,
    content: `この度は${AN.Both}のご利用ありがとうございました。

${lShortWithWeekday(meeting.plannedStartTime)}開始の案件でのご利用ポイントは${numberToCredits(costs.total)}です。(<a href="/financial/history_details?meeting_id=${meeting.id}">詳細</a>)

ご利用明細の確認、領収書のダウンロードはマイページの「ポイント履歴・領収書」から可能です。

万が一、利用ポイントに誤りがある場合は、24時間以内にご返信下さい。

通常翌営業日以内に精算し、『TOLA運営局にメッセージ頂いても領収書を発行』致します。

また、サービス向上の一環として、ご利用いただいたお客様へ
キャストの評価をお願いしております。

キャストへのレビューがお済みでなければ、今後のサービス向上のため、<a href="/meetings/${meeting.id}/review">お客様のご意見をお聞かせください。(コチラをタップ)</a>

<span style="color: red;max-width: 100%;padding: 0;">こちらに評価とコメントを記入頂けたら苦手なキャストはマッチしずらくなります。</span>
またのご利用お待ちしております🙇‍♀️🙇‍♂️
`,
  });

  if (options.noReviewMessages) return;

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: { user: { select: { id: true, serviceFeePermille: true } } },
  });
  const castCosts = calculateCostsFor(meeting as MeetingLike, attendances);

  for (const attendance of attendances) {
    const myEarnings = attendanceEarnings(meeting, attendance, castCosts.get(attendance.id));
    await systemMessageToUser(attendance.userId, {
      withBroadcast: true,
      withUnread: false,
      content: `この度はエンタメマッチングサイトTOLAのご利用ありがとうございました💖
${lShortWithWeekday(meeting.plannedStartTime)}開始の案件でのご獲得ポイントは${numberToCredits(myEarnings)}です。(<a href="/financial/history_details?meeting_id=${meeting.id}">詳細</a>)<br>
24時間後にゲストさんの確認後にポイント付与させて頂きます🎁
<span class="review_required">
  また、ゲストさんのレビューを書くことを必須とさせて頂いてます⚠️<br>
  ☆を選び、コメントを必ず入れてください🙇‍♀️🙇‍♂️<br>
  キャストさんに安心して参加してもらえるようにセキュリティの観点から必要なのです😄
</span>

【評価基準】
星5　非常に気を遣ってくれて凄く楽しかった
星4　良いゲストさんでまた参加したい
星3　いい方だが、ちょっと気を遣う
星2　印象があまり良くなくて今後も参加したくない
星1　凍結してほしいぐらい印象が悪い
<a class="message_room_cast_select_btn" href="/meetings/${meeting.id}/review">レビュー画面へ</a>
`,
    });
  }

  await enqueueOpenReviewModal(meetingId);
}

/**
 * CreateMeetingTransactions — one ledger row per cast: the guest is charged the
 * full cost, the cast credited their share, and the row is linked to the
 * attendance so the history screens can drill into it.
 */
export async function createMeetingTransactions(
  meetingId: number,
  costs: MeetingCosts,
  tx?: Tx,
): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { id: true, ownerId: true, calculationSettings: true, plannedStartTime: true },
  });
  const attendances = await client.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: { user: { select: { id: true, nickName: true, userType: true, inviterId: true, serviceFeePermille: true } } },
  });

  for (const attendance of attendances) {
    const myCosts = costs.get(attendance.id);
    const myPay = attendanceEarnings(meeting, attendance, myCosts);

    const ct = await createCreditTransaction(
      {
        chargedAmount: myCosts.total,
        chargedUserId: meeting.ownerId,
        creditedAmount: myPay,
        creditedUserId: attendance.userId,
        reason: `合流 ${meeting.id}`,
        category: 'meeting',
        withBalanceUpdates: true,
      },
      tx,
    );
    await client.castAttendance.update({
      where: { id: attendance.id },
      data: { creditTransactionId: ct.id },
    });

    await meetingCompleteAttendanceForCast(
      {
        id: attendance.user.id,
        nickName: attendance.user.nickName,
        userType: attendance.user.userType,
        inviterId: attendance.user.inviterId,
      },
      myPay,
      meeting,
      tx,
    );
  }
}

/** MarkMeetingCompleted */
export async function markMeetingCompleted(meetingId: number, costs?: MeetingCosts, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  const resolved = costs ?? (await calculateMeetingCosts(meetingId, {}, tx));
  await client.meeting.update({
    where: { id: meetingId },
    data: { ...finalCostsUpdate(meeting, resolved.total), status: 'completed' },
  });
}

/**
 * CompleteMeeting — the organizer that settles an order.
 *
 * Runs the whole chain in one transaction so a failing reward rolls back the
 * ledger rows too. The exception is a successful card charge: once
 * finalizeMeetingFinances has taken money, rolling back would lose the record of
 * real money, so the error is carried past the commit and only then re-raised.
 * That is the `dont_roll_back` flag in the original's `around` block.
 */
export async function completeMeeting(
  meetingId: number,
  options: { recharge?: boolean; simulateMoneyFlow?: boolean } = {},
): Promise<void> {
  let caughtException: unknown = null;
  let failedMeetingStatus: string | undefined;

  try {
    await prisma.$transaction(
      async (tx) => {
        let dontRollBack = false;
        try {
          const costs = await calculateMeetingCosts(meetingId, {}, tx);
          await createMeetingTransactions(meetingId, costs, tx);
          await markMeetingCompleted(meetingId, costs, tx);

          const finalize = await finalizeMeetingFinances(meetingId, options, tx);
          dontRollBack = finalize.dontRollBack;

          await rewardUsage(meetingId, tx);
          await rewardAttendance(meetingId, tx);
          await rewardInviters(meetingId, costs, tx);
          await rewardPatron(meetingId, costs, tx);
          await rewardCast(meetingId, tx);
          await updateCastRepeatCounts(meetingId, tx);
        } catch (error) {
          if (error instanceof MeetingFinanceFailure) failedMeetingStatus = error.meetingFailureStatus;
          if (dontRollBack) {
            // commit what we have, then raise outside the transaction
            caughtException = error;
            return;
          }
          throw error;
        }
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (error instanceof MeetingFinanceFailure) failedMeetingStatus = error.meetingFailureStatus;
    caughtException = error;
  }

  if (caughtException) {
    if (failedMeetingStatus) {
      await prisma.meeting
        .update({ where: { id: meetingId }, data: { status: failedMeetingStatus as never } })
        .catch((updateError: unknown) =>
          logger.error({ updateError, meetingId }, 'failed to record meeting failure status'),
        );
    }
    throw caughtException;
  }
}

// --- individual order accept / refuse -------------------------------------

/**
 * AcceptIndividualMeeting — whichever side did not initiate confirms, the money
 * is reserved, and the order becomes scheduled.
 */
export async function acceptIndividualMeeting(meetingId: number, userId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      castRank: true,
      area: true,
      owner: { select: { id: true, nickName: true, creditBalance: true } },
      castAttendances: { orderBy: { id: 'asc' }, take: 1, include: { user: true } },
    },
  });

  if (!['cast_requested', 'requested'].includes(meeting.status)) {
    throw new InteractorFailure("Order without status 'requested' can't be accepted");
  }

  const attendance = meeting.castAttendances[0];
  if (!attendance) throw new InteractorFailure('No cast attendance on this order');

  if (
    (meeting.status === 'cast_requested' && meeting.ownerId !== userId) ||
    (meeting.status === 'requested' && attendance.userId !== userId)
  ) {
    throw new InteractorFailure('No permission');
  }

  if (!config.deferred_payment) {
    const neededCredits = estimatedCosts(meeting as MeetingLike);
    const missingCredits = neededCredits - meeting.owner.creditBalance;

    if (missingCredits > 0) {
      try {
        const result = await buyCredits({
          userId: meeting.ownerId,
          amount: missingCredits,
          category: 'auto_charge',
          reason: `ポイントオートチャージ対象合流 ${meeting.id}`,
        });
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { preConversionId: result.creditConversionId },
        });
      } catch (error) {
        await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'pre_charge_fail' } });

        if (meeting.conversationId) {
          await createSystemMessage({
            conversationId: meeting.conversationId,
            withBroadcast: true,
            content: `誠に申し訳ございません。
クレジットカードでの決済処理が失敗致しました。オーダーがキャンセルになりました。
有効なクレジットカードを設定して頂くか、決済回数によっては、不正使用とカード会社が誤解をしている場合もございますので、カード会社にご確認下さい。
`,
          });
        }
        await systemMessageToUser(meeting.ownerId, {
          withUnread: true,
          withBroadcast: true,
          content: `クレジットカード決済処理で問題が発生しました：
${(error as Error).message}
`,
        });
        throw new InteractorFailure(`クレジットカードの問題が発生しました: ${(error as Error).message}`);
      }
    }

    await prisma.$transaction(async (t) => {
      await freezeCredits(meeting.ownerId, neededCredits, t);
      await t.meeting.update({ where: { id: meeting.id }, data: { frozenCredits: neededCredits } });
    });
  }

  await prisma.castAttendance.update({ where: { id: attendance.id }, data: { role: 'attending' } });
  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'scheduled' } });

  if (meeting.conversationId) {
    await createSystemMessage({
      conversationId: meeting.conversationId,
      withUnread: true,
      withBroadcast: true,
      content: `個coco（個人オーダー）のリクエストが確定しました。
素敵な時間をお過ごしください♪

<span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">ゲストさんはキャストさんへ「お店の名前・店舗URL・予約名」を。</span><span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">キャストさんはまず「挨拶」と、ゲストさんへ「到着予定時間」をお伝え下さい。</span>

※注意１：待ち合わせ場所は利用規約に沿った場所を指定して下さい。鍵の付いた個室等のご利用はできません。
※注意２：利用規約に反する行為、泥酔状態でのご利用はできません。
※注意３：カード決済は初期個coco分と延長分と別々に決済されます。延長は1.3倍のポイント消費になります。
<span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">『タイマー切ってこのまま飲もう』は利用規約によって禁止させて頂いてます。</span>
`,
    });
  }

  // The original also had a disabled (`if false && …`) master/apprentice notice
  // here; the live path is RewardPatron after payment.

  const settledCount = await prisma.castAttendance.count({
    where: {
      userId: attendance.userId,
      role: 'attending',
      meeting: { status: { in: ['completed', 'finished', 'post_charge_fail'] } },
    },
  });
  if (settledCount === 0) {
    await firstMeetingSendMessage({
      id: attendance.user.id,
      nickName: attendance.user.nickName,
      userType: attendance.user.userType,
      inviterId: attendance.user.inviterId,
    });
  }

  await scheduleStartReminders(meeting);
}

/** CastRefuseIndividualMeeting */
export async function castRefuseIndividualMeeting(meetingId: number, userId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { castAttendances: { orderBy: { id: 'asc' }, take: 1 } },
  });
  const attendance = meeting.castAttendances[0];
  if (!attendance || attendance.userId !== userId) throw new InteractorFailure('No permission');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nickName: true } });

  await prisma.castAttendance.update({
    where: { id: attendance.id },
    data: { role: 'out', decisionBy: 'cast' },
  });
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'not_enough_cast_fail' } });

  if (meeting.conversationId) {
    await createSystemMessage({
      conversationId: meeting.conversationId,
      content: `${user.nickName}は合流を辞退しました。`,
      withUnread: true,
      withBroadcast: true,
    });
  }
}

/** CustomerRefuseIndividualMeetingRequest */
export async function customerRefuseIndividualMeetingRequest(meetingId: number, userId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (meeting.ownerId !== userId) throw new InteractorFailure('No permission');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { nickName: true } });

  await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'request_denied_fail' } });
  await prisma.castAttendance.updateMany({
    where: { meetingId },
    data: { role: 'out', decisionBy: 'customer' },
  });

  if (meeting.conversationId) {
    await createSystemMessage({
      conversationId: meeting.conversationId,
      content: `${user.nickName}はオーダーをキャンセルしました。`,
      withUnread: true,
      withBroadcast: true,
    });
  }
}

export { PATRON_SHARE_PERMILLE, l, enqueueMessageBroadcast };
