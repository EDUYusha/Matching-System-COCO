import { config, l, PATRON_SHARE_PERMILLE } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';
import { InteractorFailure } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { createMeetingConversation } from '@/server/services/conversations';
import { createSystemMessage, systemMessageToUser } from '@/server/services/messages';
import { firstMeetingSendMessage } from '@/server/services/auto-send-message';
import { CastScore, type ScoredAttendance } from '@/server/services/meetings/cast-score';
import { meetingSummary, parallelAttendances, type MeetingLike } from '@/server/services/meetings/model';
import { MeetingFinanceFailure, prepareMeetingFinances } from '@/server/services/meetings/finances';
import { scheduleStartReminders } from '@/server/services/meetings/setup';

/**
 * Ports WishToAttendToMeeting, SetupCastSelection, StartCastSelection,
 * AutoSelectCast, SelectCast, OpenMeetingConversation and AutoOpenMeeting —
 * everything between "cast sees an order" and "the group chat opens".
 */

/** Carries AutoSelectCast's `failure_status`, which decides the order's new status. */
export class SelectionFailure extends InteractorFailure {
  constructor(
    message: string,
    readonly selectionFailureStatus: string | 'dont_touch' | null,
    extra: Record<string, unknown> = {},
  ) {
    super(message, { ...extra, failureStatus: selectionFailureStatus ?? undefined });
  }
}

// --- cast entering an order ------------------------------------------------

/**
 * WishToAttendToMeeting — a cast (optionally with friends) enters a group order.
 *
 * Re-uses an existing `out` row if the cast previously left, which is what makes
 * leaving and re-entering possible without tripping the unique index on
 * (meeting_id, user_id).
 */
export async function wishToAttendToMeeting(input: {
  meetingId: number;
  castId: number;
  friendIds?: number[];
}): Promise<void> {
  const friendIds = input.friendIds ?? [];

  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: {
      area: { select: { businessAreaId: true } },
      castRank: { include: { castLevels: true } },
    },
  });
  if (!meeting) throw new InteractorFailure('No meeting found');

  const cast = await prisma.user.findUnique({ where: { id: input.castId } });
  if (!cast) throw new InteractorFailure('No cast found');

  const friends = friendIds.length
    ? await prisma.user.findMany({ where: { id: { in: friendIds } } })
    : [];
  const everyone = [cast, ...friends];

  if (!everyone.every((user) => user.userType === 'cast')) {
    throw new InteractorFailure('All attendees must be cast');
  }
  if (!['requested', 'cast_selectable'].includes(meeting.status)) {
    throw new InteractorFailure('すでに募集は終了しています。');
  }
  if (everyone.some((user) => user.businessAreaId !== meeting.area.businessAreaId)) {
    throw new InteractorFailure('Cast must be same business_area as meeting');
  }

  if (friends.length) {
    const mutualFriendIds = new Set(
      (
        await prisma.friendship.findMany({
          where: { userId: cast.id, mutual: true },
          select: { friendId: true },
        })
      ).map((friendship) => friendship.friendId),
    );
    if (friends.some((friend) => !mutualFriendIds.has(friend.id))) {
      throw new InteractorFailure('Attendees must be friends of cast');
    }
  }
  if (friends.length + 1 > meeting.neededPersonCount) {
    throw new InteractorFailure('Cannot attend this meeting with so many friends');
  }

  const blocked = await prisma.blocking.findFirst({
    where: { userId: meeting.ownerId, targetId: { in: everyone.map((user) => user.id) } },
  });
  if (blocked) throw new InteractorFailure('ブロックされているのでこのオーダーには参加できません');

  if (meeting.castRankId && meeting.castRank) {
    const validCastLevelIds = new Set(meeting.castRank.castLevels.map((link) => link.castLevelId));
    for (const user of everyone) {
      // test fixtures have cast without a level; real cast always has one
      if (user.castLevelId === null) continue;
      if (!validCastLevelIds.has(user.castLevelId)) {
        throw new InteractorFailure(`${user.nickName}'s level doesn't match this meeting's rank`);
      }
    }
  }

  const createdIds: number[] = [];
  await prisma.$transaction(async (t) => {
    const leaderAttendanceId = await prepareAttendance(t, meeting, cast);
    createdIds.push(leaderAttendanceId);

    for (const friend of friends) {
      const followerId = await prepareAttendance(t, meeting, friend, leaderAttendanceId);
      createdIds.push(followerId);
    }

    if (friends.length) {
      // the leader's row points at itself, which is how team membership is read
      await t.castAttendance.update({ where: { id: leaderAttendanceId }, data: { leaderId: leaderAttendanceId } });
    }
  });

  for (const friend of friends) {
    await systemMessageToUser(friend.id, {
      withBroadcast: true,
      withUnread: true,
      content: `お友達の${cast.nickName}さんと一緒に「${meetingSummary(meeting as MeetingLike).replace(/\n/g, '')}」にエントリーされました。

エントリーがお間違いの場合、管理者にご連絡ください。
`,
    });
  }

  const activeCount = await prisma.castAttendance.count({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  if (activeCount >= meeting.neededPersonCount) {
    await setupCastSelection(meeting.id);
  }
}

/** WishToAttendToMeeting#prepare_attendance, including the double-booking check. */
async function prepareAttendance(
  t: Tx,
  meeting: { id: number; plannedStartTime: Date; plannedEndTime: Date },
  user: { id: number; nickName: string; additionalScore: number },
  leaderId?: number,
): Promise<number> {
  const existing = await t.castAttendance.findFirst({
    where: { meetingId: meeting.id, userId: user.id, role: 'out' },
  });

  const conflicts = await parallelAttendances({ userId: user.id, meetingId: meeting.id }, meeting, t);
  if (conflicts.length) {
    const conflicting = conflicts[0].meeting;
    throw new InteractorFailure(
      `${user.nickName} can't join this meeting: already participating in another meeting` +
        ` from ${conflicting.plannedStartTime.toISOString()} to ${conflicting.plannedEndTime.toISOString()}.`,
    );
  }

  const data = {
    role: 'unconfirmed' as const,
    decisionBy: null,
    additionalScore: user.additionalScore,
    ...(leaderId ? { leaderId } : {}),
  };

  if (existing) {
    const updated = await t.castAttendance.update({ where: { id: existing.id }, data });
    return updated.id;
  }
  const created = await t.castAttendance.create({
    data: { meetingId: meeting.id, userId: user.id, ...data },
  });
  return created.id;
}

/**
 * SetupCastSelection — runs once, when enough cast have entered: reserves the
 * money and opens the selection screen.
 *
 * The row lock is held until the money is reserved and the status has moved on,
 * as the original's `with_lock` block did. A second cast entering at the same
 * moment waits on the lock and then finds cast_selectable, instead of reserving
 * the credits (and auto-charging the card) a second time.
 */
export async function setupCastSelection(meetingId: number): Promise<void> {
  const before = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { status: true } });
  if (before?.status !== 'requested') return;

  let started = false;
  try {
    started = await prisma.$transaction(
      async (t) => {
        const rows = await t.$queryRaw<Array<{ status: string }>>`
          SELECT status FROM meetings WHERE id = ${meetingId} FOR UPDATE
        `;
        if (rows[0]?.status !== 'requested') return false;

        await prepareMeetingFinances(meetingId, t);
        await t.meeting.update({ where: { id: meetingId }, data: { status: 'cast_selectable' } });
        return true;
      },
      // the card charge happens inside the lock
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    // the rollback also undid the failure status prepareMeetingFinances wrote
    if (error instanceof MeetingFinanceFailure && error.meetingFailureStatus) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: error.meetingFailureStatus as never },
      });
    }
    throw error;
  }

  if (started) await startCastSelection(meetingId);
}

/** StartCastSelection — tells the guest their order can now be staffed. */
export async function startCastSelection(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (meeting.status !== 'cast_selectable') return;

  await systemMessageToUser(meeting.ownerId, {
    withBroadcast: true,
    withUnread: true,
    content: `おめでとうございます♪
キャストが集まり、オーダーのリクエストが確定されました。
<a href="/meetings/${meeting.id}">こちら</a>よりお好みのキャストの選択ができます♪

＊このオーダーは現在募集中なので、より多くのキャストが集まる可能性がございます。
＊お好みのキャスト${meeting.neededPersonCount}名を選択するか${l(meeting.requestEndTime)}を過ぎると自動でマッチングが開始されチャットルームが作成されます。

<a class="message_room_cast_select_btn" href="/meetings/${meeting.id}">キャスト選択画面へ</a>
`,
  });
}

/**
 * SelectCast — the guest picks one cast (and implicitly their whole team).
 * Only the leader or a solo entrant records decision_by: 'customer', which is
 * what triggers the selection surcharge for that attendance.
 */
export async function selectCast(meetingId: number, castAttendanceId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  const attendance = await prisma.castAttendance.findUnique({ where: { id: castAttendanceId } });
  if (!attendance || attendance.meetingId !== meetingId) {
    throw new InteractorFailure('Invalid cast attendance');
  }

  const allSelected =
    attendance.leaderId === null
      ? [attendance]
      : await prisma.castAttendance.findMany({ where: { meetingId, leaderId: attendance.leaderId } });

  const attendingCount = await prisma.castAttendance.count({ where: { meetingId, role: 'attending' } });
  if (allSelected.length > 1 && allSelected.length + attendingCount > meeting.neededPersonCount) {
    throw new InteractorFailure('More cast selected than requested');
  }

  await prisma.$transaction(async (t) => {
    for (const selected of allSelected) {
      const isIndividual = selected.leaderId === null;
      const isTeamLeader = selected.leaderId !== null && selected.leaderId === selected.id;
      await t.castAttendance.update({
        where: { id: selected.id },
        data:
          isIndividual || isTeamLeader
            ? { role: 'attending', decisionBy: 'customer' }
            : // other team members are not selected individually
              { role: 'attending' },
      });
    }
  });
}

// --- automatic selection ---------------------------------------------------

/**
 * AutoSelectCast. Returns once the order's attendances are final: everyone who
 * is in has role 'attending', everyone else 'out'.
 */
export async function autoSelectCast(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { area: true, castRank: true },
  });

  try {
    const castScore = await preDecide(meeting);
    if (castScore === null) {
      await cleanupAttendances(meetingId);
      return;
    }
    await decide(meeting, castScore);
  } catch (error) {
    if (error instanceof SelectionFailure && error.selectionFailureStatus !== 'dont_touch') {
      const status = error.selectionFailureStatus ?? 'general_fail';
      await prisma.meeting
        .update({ where: { id: meetingId }, data: { status: status as never } })
        .catch((updateError: unknown) => logger.error({ updateError, meetingId }, 'failed to set failure status'));
    }
    throw error;
  }
}

type MeetingWithRelations = Awaited<ReturnType<typeof prisma.meeting.findUniqueOrThrow>> & {
  area: { businessAreaId: number };
  castRank: { id: number } | null;
};

/**
 * AutoSelectCast#pre_decide — the cheap paths. Returns null when nothing is left
 * to decide, or a CastScore when real scoring is needed.
 */
async function preDecide(meeting: MeetingWithRelations): Promise<CastScore | null> {
  if (!['requested', 'cast_selectable', 'cast_requested'].includes(meeting.status)) {
    throw new SelectionFailure(
      "The meeting status is not 'requested', will abort auto selection",
      'dont_touch',
    );
  }

  const castAttendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });

  const cancelMessage =
    '個coco（個人オーダー）のご予約がキャンセルとなりました。またのご利用を心よりお待ちしております🙇';

  if (meeting.minimumPersonCount && castAttendances.length < meeting.minimumPersonCount) {
    throw new SelectionFailure(cancelMessage, 'not_enough_cast_fail', {
      neededCast: meeting.minimumPersonCount,
      availableCast: castAttendances.length,
    });
  }
  if (!meeting.minimumPersonCount && castAttendances.length < meeting.neededPersonCount) {
    throw new SelectionFailure(cancelMessage, 'not_enough_cast_fail', {
      neededCast: meeting.neededPersonCount,
      availableCast: castAttendances.length,
    });
  }

  // an individual order reaching this point was never accepted, so it timed out
  if (meeting.category === 'individual') {
    await prisma.castAttendance.updateMany({
      where: { meetingId: meeting.id, role: { not: 'out' } },
      data: { role: 'out', decisionBy: 'system' },
    });
    if (meeting.status === 'cast_requested') {
      throw new SelectionFailure(
        'お客様の返答がございませんでした。\n日程を確認して再度リクエストをお願い致します。',
        'request_canceled_fail',
      );
    }
    throw new SelectionFailure(
      'キャストの返答がございませんでした。\n日程を確認して再度リクエストをお願い致します。',
      'not_enough_cast_fail',
    );
  }

  const decidedCast = castAttendances.filter((attendance) => attendance.role === 'attending');
  let pendingCast = castAttendances.filter((attendance) => attendance.role === 'unconfirmed');
  let stillNeededCount = meeting.neededPersonCount - decidedCast.length;

  // We do not fail on score when the guest already picked someone, nor when we
  // are already compromising on head count.
  const minMatchingScoreRelevant =
    config.min_matching_score !== null && decidedCast.length === 0 && meeting.minimumPersonCount === null;

  if (stillNeededCount < 0) {
    throw new SelectionFailure(
      `Too much cast selected, need ${meeting.neededPersonCount}, selected ${decidedCast.length}`,
      null,
    );
  }
  if (stillNeededCount === 0) return null;

  if (pendingCast.length < stillNeededCount) {
    // only possible with minimum_person_count; the lower bound was checked above
    stillNeededCount = pendingCast.length;
  }

  if (pendingCast.length === stillNeededCount && !minMatchingScoreRelevant) {
    await prisma.castAttendance.updateMany({
      where: { id: { in: pendingCast.map((attendance) => attendance.id) } },
      data: { role: 'attending', decisionBy: 'system' },
    });
    return null;
  }

  // drop teams that can no longer fit, now that manual selection is over
  const teamSizes = new Map<number, number>();
  for (const attendance of castAttendances) {
    if (attendance.leaderId === null) continue;
    teamSizes.set(attendance.leaderId, (teamSizes.get(attendance.leaderId) ?? 0) + 1);
  }
  const oversizedLeaders = new Set(
    [...teamSizes.entries()].filter(([, size]) => size > stillNeededCount).map(([leaderId]) => leaderId),
  );
  pendingCast = pendingCast.filter(
    (attendance) => attendance.leaderId === null || !oversizedLeaders.has(attendance.leaderId),
  );

  const scored: ScoredAttendance[] = pendingCast.map((attendance) => ({
    id: attendance.id,
    userId: attendance.userId,
    leaderId: attendance.leaderId,
    additionalScore: attendance.additionalScore,
  }));

  const castScore = new CastScore(scored, stillNeededCount);
  (castScore as CastScore & { minMatchingScoreRelevant?: boolean }).minMatchingScoreRelevant =
    minMatchingScoreRelevant;
  return castScore;
}

/** AutoSelectCast#decide — scoring, then persist. */
async function decide(meeting: MeetingWithRelations, castScore: CastScore): Promise<void> {
  const allPreferences = await prisma.meetingPreferencesSchema.findMany({ where: { active: true } });
  const preferenceIds: number[] = Array.isArray(meeting.preferences)
    ? (meeting.preferences as unknown[]).map(Number).filter(Number.isFinite)
    : [];
  const ownerPreferences = allPreferences.filter((preference) => preferenceIds.includes(preference.id));

  const castPreferenceRows = await prisma.castAttendance.findMany({
    where: { id: { in: castScore.pendingCast.map((attendance) => attendance.id) } },
    select: { id: true, user: { select: { meetingPreferences: { select: { parentId: true } } } } },
  });
  const castPreferences = new Map<number, number[]>(
    castPreferenceRows.map((row) => [
      row.id,
      row.user.meetingPreferences.map((preference) => preference.parentId).filter((id): id is number => id !== null),
    ]),
  );

  // add_additional_score — a manual bump an operator set on the cast
  for (const attendance of castScore.pendingCast) {
    castScore.add(attendance, attendance.additionalScore);
  }

  await addPreviousMeetingScores(meeting, castScore, allPreferences, ownerPreferences);

  // add_usual_scores — one point bundle per preference the cast matches
  for (const ownerPreference of ownerPreferences) {
    for (const attendance of castScore.pendingCast) {
      if ((castPreferences.get(attendance.id) ?? []).includes(ownerPreference.id)) {
        castScore.add(attendance, ownerPreference.score);
      }
    }
  }

  // check_scores_and_save
  const selectedCastIds = castScore.finalCastIds();
  const minMatchingScoreRelevant = (castScore as CastScore & { minMatchingScoreRelevant?: boolean })
    .minMatchingScoreRelevant;
  if (
    minMatchingScoreRelevant &&
    config.min_matching_score !== null &&
    castScore.totalScoreFor(selectedCastIds) < config.min_matching_score
  ) {
    throw new SelectionFailure("The best score didn't fit minimal requirements", 'score_too_low_fail');
  }

  await prisma.castAttendance.updateMany({
    where: { id: { in: selectedCastIds } },
    data: { role: 'attending', decisionBy: 'system' },
  });

  await cleanupAttendances(meeting.id);
}

/**
 * AutoSelectCast#add_previous_meeting_scores — the "知り合い率" (familiarity)
 * preference. The guest can ask for cast they have met before ("知り合い優先")
 * or, by default, be steered away from them.
 */
async function addPreviousMeetingScores(
  meeting: MeetingWithRelations,
  castScore: CastScore,
  allPreferences: Array<{ name: string | null; score: number }>,
  ownerPreferences: Array<{ name: string | null }>,
): Promise<void> {
  const familiarity = allPreferences.find((preference) => preference.name === '知り合い率');
  if (!familiarity || ownerPreferences.some((preference) => preference.name === '誰でもいい')) return;

  const previousMeetings = await prisma.meeting.findMany({
    where: { ownerId: meeting.ownerId, id: { not: meeting.id } },
    select: { id: true },
  });
  if (!previousMeetings.length) return;

  const sharedAttendances = await prisma.castAttendance.groupBy({
    by: ['userId'],
    where: {
      userId: { in: castScore.pendingCast.map((attendance) => attendance.userId) },
      role: 'attending',
      meetingId: { in: previousMeetings.map((previous) => previous.id) },
    },
    _count: { _all: true },
  });
  const counts = new Map(sharedAttendances.map((row) => [row.userId, row._count._all]));

  const reverseFactor = ownerPreferences.some((preference) => preference.name === '知り合い優先') ? 1 : -1;
  const baseScore = familiarity.score;

  for (const attendance of castScore.pendingCast) {
    const count = counts.get(attendance.userId) ?? 0;
    castScore.add(attendance, count * baseScore * reverseFactor);
  }
}

/** AutoSelectCast#cleanup — everyone not selected is marked out by the system. */
async function cleanupAttendances(meetingId: number): Promise<void> {
  await prisma.castAttendance.updateMany({
    where: { meetingId, role: { notIn: ['attending', 'out'] } },
    data: { role: 'out', decisionBy: 'system' },
  });
}

// --- opening the group chat ------------------------------------------------

/**
 * OpenMeetingConversation — creates the group room, tells the cast who missed
 * out, sends the long house-rules message and flips the order to scheduled.
 */
export async function openMeetingConversation(meetingId: number): Promise<{ conversationId: number }> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { area: true, castRank: true, owner: { select: { id: true, nickName: true } } },
  });

  const conversation = await createMeetingConversation({
    id: meeting.id,
    ownerId: meeting.ownerId,
    summary: meetingSummary(meeting as MeetingLike),
  });

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id },
    include: { user: { select: { id: true, nickName: true, firstPrivatelyMetUserId: true, firstPrivatelyMetAt: true } } },
  });

  for (const attendance of attendances) {
    if (attendance.role === 'out' && attendance.decisionBy === 'system') {
      await systemMessageToUser(attendance.userId, {
        withUnread: true,
        content: `オーダーにエントリー頂き、誠にありがとうございました。残念ながら「${meetingSummary(
          meeting as MeetingLike,
        ).replace(/\n/g, '')}」のマッチングには外れてしました。是非またオーダーにエントリー頂けますようお願いいたします！`,
      });
    } else if (attendance.role === 'attending') {
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
          userType: 'cast',
          inviterId: null,
        });
      }
      // The original also had a master/apprentice announcement here, guarded by
      // `if false && …` — disabled in production, so it is not reproduced. The
      // live path is RewardPatron, which posts it after payment succeeds.
    }
  }

  await createSystemMessage({
    conversationId: conversation.id,
    withBroadcast: true,
    withUnread: true,
    content: `おめでとうございます♪
マッチングが確定しました♪

<span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">ゲストさんはキャストさんへ「お店の名前・店舗URL・予約名」を。</span><span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">キャストさんはまず「挨拶」と、ゲストさんへ「到着予定時間」をお伝え下さい。</span>
ゲストさんが合流場所に遅れた場合は、時間を確保しているのでキャストさんが合流場所に到着して合流開始となります。
キャストさんは「到着しました」と一言を入れて、「開始」ボタンを押して下さい。

※注意１：待ち合わせ場所は利用規約に沿った場所を指定して下さい。鍵の付いた個室等のご利用はできません。
※注意２：利用規約に反する行為、泥酔状態でのご利用はできません。
※注意3：30分後のオーダーの場合、募集終了時刻より、5分経ってもゲストさん、運営に対して連絡がない場合は、別キャストに差し替える場合もありますのでご了承ください。
※注意４：カード決済は初期個coco分と延長分と別々に決済されます。延長は1.3倍のポイント消費になります。
※注意５：コール確定後のキャンセルは利用規約第10条5項によりキャンセル費は全額負担となります。
<span style="color:#c9970f;font-weight: bold;max-width: 100%;padding: 0;">『タイマー切ってこのまま飲もう』は利用規約によって禁止となりご利用を制限させて頂きます。</span>
`,
  });

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: 'scheduled', conversationId: conversation.id },
  });

  await scheduleStartReminders(meeting);

  return { conversationId: conversation.id };
}

/** AutoOpenMeeting — the organizer: AutoSelectCast then OpenMeetingConversation. */
export async function autoOpenMeeting(meetingId: number): Promise<{ conversationId: number }> {
  await autoSelectCast(meetingId);
  return openMeetingConversation(meetingId);
}

export { PATRON_SHARE_PERMILLE };
