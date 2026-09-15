import { Prisma } from '@prisma/client';
import { config, idiv, isoDate, l, PATRON_SHARE_PERMILLE, tokyoMonthsAgo, tokyoStartOfDay } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
import { createSystemMessage, messageRecipients, systemMessageToUser } from '@/server/services/messages';
import {
  broadcastMeetingRequestCanceled,
  broadcastMessagesRead,
  broadcastNewMeetingRequest,
  broadcastOpenReviewModal,
  lineDeepLink,
  sendPushMessage,
  sendSnsMessage,
  sendWebMessage,
} from '@/server/services/notifications';
import { autoOpenMeeting } from '@/server/services/meetings/selection';
import { handleFailedMeeting } from '@/server/services/meetings/finances';
import { completeMeeting, markMeetingFinished } from '@/server/services/meetings/lifecycle';
import { availableCast, potentialCast } from '@/server/services/meetings/model';
import { blockedUserIds } from '@/server/services/blockings';
import { createCreditTransaction } from '@/server/services/credits';
import { deliverQueuedMail } from '@/server/mail/mailer';
import { enqueueMeetingBroadcast } from '@/server/jobs/queues';

/**
 * Ports every Sidekiq worker in app/workers (and app/workers/cron).
 *
 * The handlers keep the originals' logging, because operators use those lines to
 * follow an order through settlement.
 */

// --- MessageBroadcastWorker ------------------------------------------------

export async function messageBroadcastWorker(payload: {
  messageId: number;
  recipientIds?: number[] | null;
}): Promise<void> {
  logger.info({ messageId: payload.messageId, recipientIds: payload.recipientIds }, 'MessageBroadcastWorker: start');

  const message = await prisma.message.findUnique({
    where: { id: payload.messageId },
    include: {
      sender: { select: { id: true, nickName: true, profilePicUrl: true } },
      conversation: { select: { id: true, category: true } },
    },
  });
  if (!message) {
    logger.warn({ messageId: payload.messageId }, 'MessageBroadcastWorker: message is gone');
    return;
  }

  let recipients = payload.recipientIds?.length
    ? await prisma.user.findMany({
        where: { id: { in: payload.recipientIds } },
        include: { settings: true },
      })
    : await messageRecipients(message.id);

  const blockers = await prisma.blocking.findMany({
    where: { targetId: message.senderId },
    select: { userId: true },
  });
  const blockerIds = new Set(blockers.map((blocking) => blocking.userId));
  recipients = recipients.filter((recipient) => !blockerIds.has(recipient.id));

  logger.info({ messageId: message.id, count: recipients.length }, 'MessageBroadcastWorker: recipients resolved');

  await sendWebMessage(message, recipients.map((recipient) => recipient.id));
  await sendPushMessage(
    {
      title: message.sender.nickName,
      body: message.category === 'picture' ? '[shared a picture]' : message.content,
    },
    recipients,
  );

  if (config.inquiry_mail_notifications) {
    const conversation = message.conversation;
    const senderType = (
      await prisma.user.findUnique({ where: { id: message.senderId }, select: { userType: true } })
    )?.userType;
    const isSupportRoom = conversation.category === 'admin' || conversation.category === 'operator';
    const senderIsStaff = senderType === 'admin' || senderType === 'operator';

    if (isSupportRoom && !senderIsStaff) {
      // only mail once per quiet period, so a burst of messages is one alert
      const previous = await prisma.message.findFirst({
        where: { conversationId: conversation.id, senderId: message.senderId, id: { not: message.id } },
        orderBy: { sentAt: 'desc' },
      });
      const quietFor = previous?.sentAt ? Date.now() - previous.sentAt.getTime() : Number.POSITIVE_INFINITY;
      if (quietFor > config.inquiry_mail_pause_interval * 1000) {
        await deliverQueuedMail('AdminMailer.inquiry_notification', { messageId: message.id });
      }
    }
  }

  // LINE goes only to recipients who have not switched message notifications off
  const lineRecipients = recipients.filter((recipient) => {
    if (recipient.id === message.senderId) return false;
    if (recipient.settings && recipient.settings.messageNotification === false) return false;
    return true;
  });

  if (!lineRecipients.length) {
    logger.warn({ messageId: message.id }, 'MessageBroadcastWorker: no LINE recipients after filtering');
    return;
  }

  const { env } = await import('@/server/config/env');
  await sendSnsMessage({
    recipients: lineRecipients.map((recipient) => ({ id: recipient.id, snsId: recipient.snsId })),
    template: 'sns_templates/rich_message.ruby',
    templateData: {
      title: `${message.sender.nickName}からメッセージが届きました。`,
      text: 'メッセージを確認しましょう！',
      image_url: message.sender.profilePicUrl ? env.hostPrefix + message.sender.profilePicUrl : '',
      button_text: 'メッセージを読む',
      url: lineDeepLink(`/conversations/${message.conversationId}`),
    },
  }).catch((error: unknown) => {
    logger.error({ error, messageId: message.id }, 'MessageBroadcastWorker: SendSNSMessage failed');
  });
}

// --- InformReadWorker -----------------------------------------------------

export async function informReadWorker(payload: {
  conversationId: number;
  readerId: number;
  messageIds: number[];
}): Promise<void> {
  if (!payload.messageIds.length) return;

  const messages = await prisma.message.findMany({
    where: { id: { in: payload.messageIds } },
    select: { id: true, senderId: true },
  });
  const conversation = await prisma.conversation.findUnique({
    where: { id: payload.conversationId },
    select: { category: true },
  });
  if (!conversation) return;

  const speakers = await prisma.speaker.findMany({
    where: { conversationId: payload.conversationId, userId: { not: payload.readerId } },
    select: { userId: true },
  });

  // each sender is told only about their own messages
  for (const speaker of speakers) {
    const theirs = messages.filter((message) => message.senderId === speaker.userId);
    if (!theirs.length) continue;
    await broadcastMessagesRead({
      conversationId: payload.conversationId,
      conversationCategory: conversation.category,
      recipientId: speaker.userId,
      messageIds: theirs.map((message) => message.id),
    });
  }
}

// --- MeetingBroadcastWorker ----------------------------------------------

export async function meetingBroadcastWorker(payload: {
  meetingId: number;
  scope?: string | null;
}): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: payload.meetingId },
    include: { area: true, castRank: { include: { castLevels: true } } },
  });
  if (!meeting) return;

  const businessAreaId = meeting.area.businessAreaId;
  const castLevelIds = meeting.castRank?.castLevels.map((link) => link.castLevelId) ?? [];

  if (!['requested', 'cast_selectable'].includes(meeting.status)) {
    await broadcastMeetingRequestCanceled({ businessAreaId, castLevelIds });
    return;
  }

  const areaName = meeting.areaName || meeting.area.name;
  const flashText = `新しいオーダーがあります: ${areaName} ${meeting.neededPersonCount}人 ${l(meeting.plannedStartTime)}`;

  const { env } = await import('@/server/config/env');
  const snsText = `新しいオーダーが届きました♪

■${meeting.castRank?.name ?? ''}オーダー
集合時間： ${l(meeting.plannedStartTime)}
場所： ${areaName}
人数： ${meeting.neededPersonCount}
予定がなければ参加しましょう！
${env.hostPrefix}/meetings?openExternalBrowser=1
※お試しオーダーは金額を確認してください

上位キャストさんはグループcocoから個cocoに繋げてます💖
`;

  await broadcastNewMeetingRequest({
    businessAreaId,
    castLevelIds,
    message: flashText,
    requesterId: meeting.ownerId,
  });

  // scope decides who gets the push/LINE notification
  let recipients: Array<{ id: number; snsId: string | null; deviceIds: unknown }>;
  if (payload.scope === 'none') {
    recipients = [];
  } else if (payload.scope === 'all') {
    recipients = await potentialCast(meeting.id);
  } else if (payload.scope === 'available') {
    recipients = await availableCast(meeting.id);
  } else {
    if (payload.scope) logger.error({ scope: payload.scope }, 'Invalid scope in MeetingBroadcastWorker');
    recipients = config.cast_always_receive_meeting_notifications
      ? await potentialCast(meeting.id)
      : await availableCast(meeting.id);
  }

  // never notify a cast who has blocked the guest, or whom the guest has blocked
  const { blockedByMe, blockingMe } = await blockedUserIds(meeting.ownerId);
  const excluded = new Set([...blockedByMe, ...blockingMe]);
  recipients = recipients.filter((recipient) => !excluded.has(recipient.id));

  const [title, body] = flashText.split(':');
  await sendPushMessage({ title, body: body ?? '' }, recipients);

  await sendSnsMessage({
    recipients: recipients.map((recipient) => ({ id: recipient.id, snsId: recipient.snsId })),
    template: 'sns_templates/simple_message.ruby',
    templateData: { text: snsText },
  }).catch((error: unknown) => {
    logger.error({ error, meetingId: meeting.id }, 'SendSNSMessage failed for meeting');
  });

  if (config.admin_new_meeting_email && !payload.scope) {
    await deliverQueuedMail('AdminMailer.new_meeting_notification', { meetingId: meeting.id });
  }
}

// --- AutoOpenMeetingWorker ----------------------------------------------

/**
 * AutoOpenMeetingWorker — fires when recruitment closes. Cancels the order when
 * too few cast entered, otherwise runs the automatic matching.
 */
export async function autoOpenMeetingWorker(payload: { meetingId: number }): Promise<void> {
  logger.info({ meetingId: payload.meetingId }, 'AutoOpenMeetingWorker: start');

  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting) {
    logger.warn({ meetingId: payload.meetingId }, 'AutoOpenMeetingWorker: meeting not found');
    return;
  }

  if (!['requested', 'cast_selectable', 'cast_requested'].includes(meeting.status)) {
    logger.info({ meetingId: meeting.id, status: meeting.status }, 'AutoOpenMeetingWorker: not applicable');
    return;
  }

  const requestEndTimePassed = !!meeting.requestEndTime && Date.now() > meeting.requestEndTime.getTime();

  if (requestEndTimePassed) {
    const attendanceCount = await prisma.castAttendance.count({
      where: { meetingId: meeting.id, role: { not: 'out' } },
    });
    const neededCount = meeting.minimumPersonCount ?? meeting.neededPersonCount;

    if (attendanceCount < neededCount) {
      logger.info(
        { meetingId: meeting.id, attendanceCount, neededCount },
        'AutoOpenMeetingWorker: cancelling, not enough cast',
      );
      await handleFailedMeeting({
        meetingId: meeting.id,
        errorMessage:
          meeting.category === 'general'
            ? `誠に申し訳ございません。
${meeting.neededPersonCount}名のキャストをお探ししましたが募集人数に達しなかったためご予約をキャンセルさせていただきました。
実施時間、開始時間、場所などを変更して、オーダーするとキャストが集まる場合がございます。
またのご利用心よりお待ちしております🙇

応募キャスト : ${attendanceCount}
`
            : '個coco（個人オーダー）のご予約がキャンセルとなりました。またのご利用を心よりお待ちしております🙇',
        failureStatus: 'not_enough_cast_fail',
      });

      if (meeting.category === 'general') await enqueueMeetingBroadcast(meeting.id);
      return;
    }
  } else {
    logger.warn(
      { meetingId: meeting.id, requestEndTime: meeting.requestEndTime },
      'AutoOpenMeetingWorker: request_end_time has not passed yet',
    );
  }

  try {
    await autoOpenMeeting(meeting.id);
    logger.info({ meetingId: meeting.id }, 'AutoOpenMeetingWorker: matching succeeded');
  } catch (error) {
    const failureStatus = (error as { failureStatus?: string }).failureStatus;
    logger.error({ error, meetingId: meeting.id, failureStatus }, 'AutoOpenMeetingWorker: matching failed');

    await handleFailedMeeting({
      meetingId: meeting.id,
      errorMessage: (error as Error).message,
      failureStatus,
    }).catch((failError: unknown) =>
      logger.error({ failError, meetingId: meeting.id }, 'AutoOpenMeetingWorker: HandleFailedMeeting failed'),
    );
  }

  if (meeting.category === 'general') await enqueueMeetingBroadcast(meeting.id);
}

// --- reminders -----------------------------------------------------------

/** RemindSelectionEndWorker — only nags when there is a real choice to make. */
export async function remindSelectionEndWorker(payload: { meetingId: number }): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting || meeting.status !== 'cast_selectable') return;
  if (!meeting.requestEndTime || Date.now() >= meeting.requestEndTime.getTime()) return;

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  const unconfirmed = attendances.filter((attendance) => attendance.role === 'unconfirmed').length;
  const attending = attendances.filter((attendance) => attendance.role === 'attending').length;
  const realSelection = unconfirmed > meeting.neededPersonCount - attending;
  if (!realSelection) return;

  await systemMessageToUser(meeting.ownerId, {
    withBroadcast: true,
    content: `キャストを選択できる期間は残りわずかとなりました。
キャストを選択しなかった場合オートマッチングになります。
`,
  });
}

/** RemindMeetingStartWorker */
export async function remindMeetingStartWorker(payload: { meetingId: number }): Promise<void> {
  if (!config.remind_time_before_meeting_start) return;
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting || meeting.status !== 'scheduled') return;
  if (Date.now() >= meeting.plannedStartTime.getTime()) return;
  if (!meeting.conversationId) return;

  await createSystemMessage({
    conversationId: meeting.conversationId,
    withUnread: true,
    withBroadcast: true,
    content: `オーダー予定時刻の${idiv(config.remind_time_before_meeting_start, 60)}分前です。`,
  });
}

/** RemindMeetingArrivalWorker — chases cast who have not pressed 開始. */
export async function remindMeetingArrivalWorker(payload: { meetingId: number }): Promise<void> {
  if (!config.remind_time_after_meeting_start) return;
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting || !['scheduled', 'in_progress'].includes(meeting.status) || !meeting.conversationId) return;

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' }, startTime: null },
    include: { user: { select: { nickName: true } } },
  });
  if (!attendances.length) return;

  const names = `${attendances.map((attendance) => `${attendance.user.nickName}さん`).join('、')}！`;
  await createSystemMessage({
    conversationId: meeting.conversationId,
    withUnread: true,
    withBroadcast: true,
    content: `${names}開始予定時刻より${idiv(config.remind_time_after_meeting_start, 60)}分オーバーしています。開始ボタンを押し忘れていませんか？`,
  });
}

/** RemindMeetingEndWorker — per cast, or one shared reminder. */
export async function remindMeetingEndWorker(payload: {
  meetingId: number;
  castAttendanceId: number | null;
}): Promise<void> {
  if (!config.remind_time_before_meeting_end) return;
  const minutesToEnd = idiv(config.remind_time_before_meeting_end, 60);

  if (
    payload.castAttendanceId === null &&
    (config.costs_for_being_early || config.only_consider_attendance_time_spans_for_costs)
  ) {
    logger.error('RemindMeetingEndWorker needs a cast_attendance_id at the current settings!');
    return;
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting || !['scheduled', 'in_progress'].includes(meeting.status) || !meeting.conversationId) return;

  if (payload.castAttendanceId === null) {
    const onTime = await prisma.castAttendance.findMany({
      where: {
        meetingId: meeting.id,
        role: 'attending',
        endTime: null,
        startTime: { lte: meeting.plannedStartTime },
        user: { userType: 'cast' },
      },
      include: { user: { select: { nickName: true } } },
    });
    if (!onTime.length) return;

    const names = onTime.map((attendance) => `${attendance.user.nickName}さん`).join('、');
    await createSystemMessage({
      conversationId: meeting.conversationId,
      withUnread: true,
      withBroadcast: true,
      content: `${names}はオーダー終了予定時刻${minutesToEnd}分前になります。オーダー時間を過ぎると自動延長になります。`,
    });
    return;
  }

  const attendance = await prisma.castAttendance.findFirst({
    where: {
      id: payload.castAttendanceId,
      meetingId: meeting.id,
      role: 'attending',
      endTime: null,
      user: { userType: 'cast' },
    },
    include: { user: { select: { nickName: true } } },
  });
  if (!attendance) return;

  await createSystemMessage({
    conversationId: meeting.conversationId,
    withUnread: true,
    withBroadcast: true,
    content: `${attendance.user.nickName}さんはオーダー終了予定時刻${minutesToEnd}分前になります。`,
  });
}

/** OpenReviewModalWorker */
export async function openReviewModalWorker(payload: { meetingId: number }): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting || !['finished', 'completed'].includes(meeting.status)) return;

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
    select: { userId: true },
  });

  for (const userId of [meeting.ownerId, ...attendances.map((attendance) => attendance.userId)]) {
    await broadcastOpenReviewModal(userId, meeting.id);
  }
}

/** CompleteMeetingWorker */
export async function completeMeetingWorker(payload: { meetingId: number }): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting) return;

  if (meeting.status !== 'finished') {
    logger.warn({ meetingId: meeting.id, status: meeting.status }, 'CompleteMeetingWorker: not finished, skipping');
    return;
  }

  logger.info({ meetingId: meeting.id }, 'CompleteMeetingWorker: settling');
  try {
    await completeMeeting(meeting.id);
    logger.info({ meetingId: meeting.id }, 'CompleteMeetingWorker: settled');
  } catch (error) {
    // a post_charge_fail status here is an expected outcome, not a worker failure
    logger.error({ error, meetingId: meeting.id }, 'CompleteMeetingWorker: settlement failed');
  }
}

/** FinishMeetingWorker — marks finished but deliberately does not settle. */
export async function finishMeetingWorker(payload: { meetingId: number }): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: payload.meetingId } });
  if (!meeting) return;

  if (['finished', 'completed'].includes(meeting.status)) {
    logger.info({ meetingId: meeting.id, status: meeting.status }, 'FinishMeetingWorker: already finished');
    return;
  }

  await markMeetingFinished(meeting.id);
  logger.info(
    { meetingId: meeting.id },
    'FinishMeetingWorker: marked finished; settle via /internal_api/meetings/:id/complete',
  );
}

// --- cron ----------------------------------------------------------------

/**
 * CollectPostRewardsWorker — pays cast for the likes they gave yesterday.
 * Only likes on posts younger than cast_like_hour_limit count.
 */
export async function collectPostRewardsWorker(): Promise<void> {
  const dayChange = config.cast_like_day_change;
  const endOfWindow = tokyoStartOfDay(new Date(), dayChange);
  const startOfWindow = new Date(endOfWindow.getTime() - 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<Array<{ user_id: number; like_count: bigint }>>(Prisma.sql`
    SELECT users.id AS user_id, COUNT(post_likes.id) AS like_count
    FROM users
    JOIN post_likes ON post_likes.user_id = users.id
    JOIN posts ON posts.id = post_likes.post_id
    WHERE users.user_type = 'cast'::"UserType"
      AND users.discarded_at IS NULL
      AND post_likes.created_at > ${startOfWindow}
      AND post_likes.created_at <= ${endOfWindow}
      AND EXTRACT(EPOCH FROM (post_likes.created_at - posts.created_at)) / 3600 < ${config.cast_like_hour_limit}
    GROUP BY users.id
    HAVING COUNT(post_likes.id) > 0
  `);

  for (const row of rows) {
    await createCreditTransaction({
      creditedUserId: row.user_id,
      creditedAmount: Number(row.like_count) * config.cast_credits_per_like,
      reason: `${isoDate(startOfWindow)}~${isoDate(endOfWindow)} reward for post likes`,
      category: 'likes_reward',
      withBalanceUpdates: true,
    });
  }

  logger.info({ rewarded: rows.length }, 'CollectPostRewardsWorker: done');
}

/**
 * HandleInactiveNewCustomersWorker — chases invited guests who have not used
 * their trial credits, and zeroes the balance once the 14 days are up.
 */
export async function handleInactiveNewCustomersWorker(): Promise<void> {
  const dayOf = (daysAgo: number) => isoDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000));
  const oneWeekAgo = dayOf(7);
  const twoWeeksAgo = dayOf(14);
  const beforeTwoWeeksAgo = dayOf(15);

  const users = await prisma.$queryRaw<Array<{ id: number; join_date: Date; credit_balance: number }>>(Prisma.sql`
    SELECT users.id, users.join_date, users.credit_balance
    FROM users
    WHERE users.user_type = 'customer'::"UserType"
      AND users.discarded_at IS NULL
      AND users.inviter_id IS NOT NULL
      AND users.join_date IN (${oneWeekAgo}::date, ${twoWeeksAgo}::date, ${beforeTwoWeeksAgo}::date)
      AND NOT EXISTS (
        SELECT 1 FROM credit_transactions ct
        WHERE (ct.charged_user_id = users.id OR ct.credited_user_id = users.id)
          AND ct.category NOT IN (
            'sticker'::"CreditTransactionCategory",
            'manual'::"CreditTransactionCategory",
            'manual_reflect'::"CreditTransactionCategory"
          )
      )
  `);

  for (const user of users) {
    const joinDate = isoDate(user.join_date);
    const expiry = isoDate(new Date(user.join_date.getTime() + 15 * 24 * 60 * 60 * 1000));

    if (joinDate === oneWeekAgo) {
      await systemMessageToUser(user.id, {
        withUnread: true,
        withBroadcast: true,
        content: `登録して7日間が経ちましたが、cocoはいかがでしょうか？
お試しポイントの使用期限は14日間🎁ですので、${expiry}に無効となり、御利用がまだのゲストさんはぜひこの期間に御利用下さい。
※ギフトでポイントを使用する場合には、ギフト分のポイントは購入頂くことになりますのでご了承下さい。
`,
      });
    } else if (joinDate === twoWeeksAgo) {
      await systemMessageToUser(user.id, {
        withUnread: true,
        withBroadcast: true,
        content: `登録して13日間が経ちました㊗️
ご利用の頂いたゲストさんにはご感想頂ければポイント1,000Pプレゼント🎁致しますので、
coco運営局に、『登録後の感想』をご連絡下さいませ。

御利用がまだのゲストさんは、
お試しポイントの使用期限は14日間ですので、明日に無効となります。
実施日が後日でも、明日中にオーダーが確定するとポイントが使用できます。
`,
      });
    } else if (joinDate === beforeTwoWeeksAgo) {
      // the trial credits expire
      await prisma.user.update({ where: { id: user.id }, data: { creditBalance: 0 } });
    }
  }

  logger.info({ processed: users.length }, 'HandleInactiveNewCustomersWorker: done');
}

/**
 * ReapInactivePatronsWorker — the master/apprentice relationship lapses after two
 * months of inactivity, with warnings at one and two months.
 *
 * The original concatenated the apprentice names with a NUL separator and split on
 * it; this uses a printable separator that cannot occur in a nickname.
 */
const NAME_SEPARATOR = '␟';

export async function reapInactivePatronsWorker(): Promise<void> {
  const oneMonthAgo = isoDate(tokyoMonthsAgo(1));
  const twoMonthsAgo = isoDate(tokyoMonthsAgo(2));

  const rows = await prisma.$queryRaw<
    Array<{ id: number; nick_name: string; last_transaction: Date; first_cast_names: string }>
  >(Prisma.sql`
    SELECT users.id, users.nick_name,
           MAX(credit_transactions.created_at) AS last_transaction,
           STRING_AGG(DISTINCT first_casts.nick_name, ${NAME_SEPARATOR}) AS first_cast_names
    FROM users
    JOIN credit_transactions
      ON credit_transactions.credited_user_id = users.id OR credit_transactions.charged_user_id = users.id
    JOIN users first_casts
      ON first_casts.first_privately_met_user_id = users.id AND first_casts.first_privately_met_at IS NOT NULL
    WHERE users.user_type IN ('customer'::"UserType", 'inviter'::"UserType")
      AND users.discarded_at IS NULL
    GROUP BY users.id, users.nick_name
    HAVING DATE(MAX(credit_transactions.created_at)) <= ${oneMonthAgo}::date
  `);

  const sharePercent = (PATRON_SHARE_PERMILLE / 10).toFixed(1);

  for (const row of rows) {
    const lastTransactionDate = isoDate(row.last_transaction);
    const castString = `${row.first_cast_names.split(NAME_SEPARATOR).join('さんと')}さん`;

    if (lastTransactionDate === oneMonthAgo) {
      await systemMessageToUser(row.id, {
        withUnread: true,
        withBroadcast: true,
        content: `${row.nick_name}師匠❗️
現在1ヶ月間cocoの利用がございません。
あと１ヶ月で${castString}との師弟関係が解消されますのでご確認をお願い致します。
※現在初回指導した弟子キャストさんの参加オーダーの${sharePercent}%が獲得される状況です。
`,
      });
    } else if (lastTransactionDate === twoMonthsAgo) {
      await systemMessageToUser(row.id, {
        withUnread: true,
        withBroadcast: true,
        content: `${row.nick_name}師匠❗️
明日で2ヶ月間cocoの利用がないため、
弟子キャストの${castString}との師弟関係が解消されますのでご注意下さい💦
※現在初回指導した弟子キャストさんの参加オーダーの${sharePercent}%が獲得される状況です。
`,
      });
    } else if (lastTransactionDate < twoMonthsAgo) {
      // clearing first_privately_met_at, not the user id, is what ends the share
      await prisma.user.updateMany({
        where: { firstPrivatelyMetUserId: row.id },
        data: { firstPrivatelyMetAt: null },
      });
      await systemMessageToUser(row.id, {
        withUnread: true,
        withBroadcast: true,
        content: `2ヶ月間cocoの利用がなかったため、${castString}との師弟関係が解消されました。\n`,
      });
    }
  }

  logger.info({ processed: rows.length }, 'ReapInactivePatronsWorker: done');
}
