import { config } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { InteractorFailure } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { buyCredits, revertPayment } from '@/server/services/buy-credits';
import { createCreditTransaction, freezeCredits, unfreezeCredits } from '@/server/services/credits';
import { createSystemMessage, systemMessageToUser } from '@/server/services/messages';
import { enqueueMail } from '@/server/jobs/queues';
import { calculationSettings, estimatedCosts, type MeetingLike } from '@/server/services/meetings/model';

/**
 * Ports PrepareMeetingFinances, FinalizeMeetingFinances, HandleFailedMeeting and
 * CancelMeeting — the money side of an order's lifecycle.
 *
 * The invariant the original maintains: an order reserves its estimated cost as
 * *frozen* credits before it starts, auto-charging the card for any shortfall,
 * and settles against the real cost at the end. Frozen credits are always
 * released, even when a chargeback fails, so the guest is never left without them.
 */

export class MeetingFinanceFailure extends InteractorFailure {
  constructor(message: string, readonly meetingFailureStatus?: string) {
    super(message, { failureStatus: meetingFailureStatus });
  }
}

/**
 * PrepareMeetingFinances — reserve the estimated cost (including the night
 * surcharge) before cast selection opens.
 */
export async function prepareMeetingFinances(
  meetingId: number,
  tx?: Tx,
): Promise<{ creditConversionId?: number }> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { castRank: true, area: true, owner: { select: { id: true, creditBalance: true } } },
  });

  if (meeting.owner.creditBalance < 0) {
    throw new InteractorFailure('Cannot start meeting when unsettled purchases are present');
  }

  const settings = calculationSettings(meeting);
  if (config.deferred_payment || settings.no_pre_charge) return {};

  const neededCredits = estimatedCosts(meeting as MeetingLike, { withNightSurcharge: true });
  const missingCredits = neededCredits - meeting.owner.creditBalance;

  if (missingCredits <= 0) {
    await transaction(tx, async (t) => {
      await freezeCredits(meeting.ownerId, neededCredits, t);
      await t.meeting.update({ where: { id: meeting.id }, data: { frozenCredits: neededCredits } });
    });
    return {};
  }

  let conversionId: number;
  try {
    const result = await buyCredits({
      userId: meeting.ownerId,
      amount: missingCredits,
      category: 'auto_charge',
      reason: `ポイントオートチャージ対象合流 ${meeting.id}`,
    }, tx);
    conversionId = result.creditConversionId;
  } catch (error) {
    await client.meeting.update({ where: { id: meeting.id }, data: { status: 'pre_charge_fail' } });
    throw new MeetingFinanceFailure(
      `クレジットカードの問題が発生しました: ${(error as Error).message}`,
      'pre_charge_fail',
    );
  }

  await transaction(tx, async (t) => {
    await t.meeting.update({
      where: { id: meeting.id },
      data: { preConversionId: conversionId, frozenCredits: neededCredits },
    });
    await freezeCredits(meeting.ownerId, neededCredits, t);
  });

  return { creditConversionId: conversionId };
}

export interface FinalizeResult {
  creditConversionId?: number;
  /** set once the card has been charged and the outer transaction must not roll back */
  dontRollBack: boolean;
  failedMeetingStatus?: string;
}

/**
 * FinalizeMeetingFinances — release the reservation and charge whatever the
 * order actually cost beyond the balance.
 *
 * After a successful charge the outer transaction may no longer roll back: the
 * API call cannot be undone, so losing the ledger rows would lose real money.
 * That is what `dontRollBack` signals to completeMeeting.
 */
export async function finalizeMeetingFinances(
  meetingId: number,
  options: { recharge?: boolean; simulateMoneyFlow?: boolean } = {},
  tx?: Tx,
): Promise<FinalizeResult> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUnique({
    where: { id: meetingId },
    include: { owner: { select: { id: true, creditBalance: true } } },
  });
  if (!meeting) throw new InteractorFailure('No meeting given');

  if (meeting.frozenCredits > 0) {
    await transaction(tx, async (t) => {
      await unfreezeCredits(meeting.ownerId, meeting.frozenCredits, t);
      await t.meeting.update({ where: { id: meeting.id }, data: { frozenCredits: 0 } });
    });
  }

  const owner = await client.user.findUniqueOrThrow({
    where: { id: meeting.ownerId },
    select: { creditBalance: true },
  });
  if (owner.creditBalance >= 0) return { dontRollBack: false };

  const flow = options.recharge ? 're_in' : 'in';

  let conversionId: number;
  try {
    const result = await buyCredits({
      userId: meeting.ownerId,
      amount: -owner.creditBalance,
      category: 'auto_charge',
      reason: `ポイントオートチャージ対象合流 ${meeting.id}`,
      flowDirection: flow,
      note: `Meeting ${meeting.plannedStartTime.toISOString().slice(0, 10)}`,
      simulateMoneyFlow: options.simulateMoneyFlow,
    }, tx);
    conversionId = result.creditConversionId;
  } catch (error) {
    await client.meeting.update({ where: { id: meeting.id }, data: { status: 'post_charge_fail' } });
    throw new MeetingFinanceFailure(
      `クレジットカードの問題が発生しました: ${(error as Error).message}`,
      'post_charge_fail',
    );
  }

  if (options.recharge) {
    await client.meeting.update({
      where: { id: meeting.id },
      data: { status: 'completed', postConversionId: conversionId },
    });
  } else {
    await client.meeting.update({ where: { id: meeting.id }, data: { postConversionId: conversionId } });
  }

  return { creditConversionId: conversionId, dontRollBack: true };
}

export type InformTarget = 'nobody' | 'all' | 'owner' | 'cast';

export interface HandleFailedMeetingInput {
  meetingId: number;
  errorMessage?: string | null;
  failureStatus?: string;
  chargeBack?: boolean;
  informParticipants?: InformTarget;
}

/**
 * HandleFailedMeeting — unfreeze, optionally charge back, set the failure status
 * and tell whoever needs telling.
 *
 * Two failure statuses get bespoke copy because they are expected rather than
 * exceptional: not_enough_cast_fail and pre_charge_fail.
 */
export async function handleFailedMeeting(input: HandleFailedMeetingInput): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: input.meetingId },
    include: {
      conversation: { select: { id: true } },
      owner: { select: { id: true, creditBalance: true } },
    },
  });

  let errorMsg = input.errorMessage || 'General Error';
  let failureStatus = input.failureStatus || 'general_fail';
  let informParticipants: InformTarget = input.informParticipants ?? 'nobody';

  if (failureStatus === 'not_enough_cast_fail') {
    if (meeting.category === 'general') {
      const attendanceCount = await prisma.castAttendance.count({ where: { meetingId: meeting.id } });
      informParticipants = 'all';
      errorMsg = `誠に申し訳ございません。
${meeting.neededPersonCount}名のキャストをお探ししましたが募集人数に達しなかったためご予約をキャンセルさせていただきました。
実施時間、開始時間、場所などを変更して、オーダーするとキャストが集まる場合がございます。
またのご利用心よりお待ちしております🙇‍️

応募キャスト : ${attendanceCount}
`;
    }
  } else if (failureStatus === 'pre_charge_fail') {
    informParticipants = 'all';
    errorMsg = `誠に申し訳ございません。
お客様のクレジットエラーにより、オーダーがキャンセルになりました。
有効なクレジットカードを設定して頂くか、決済回数によっては、不正使用とカード会社が誤解をしている場合もございますので、カード会社にご確認下さい。
`;
    await enqueueMail('AdminMailer.pre_charge_failed_meeting', { meetingId: meeting.id });
  }

  // always give the frozen credits back; if a chargeback then fails the guest at
  // least keeps the credits rather than losing both
  if (meeting.frozenCredits > 0) {
    await prisma.$transaction(async (t) => {
      await unfreezeCredits(meeting.ownerId, meeting.frozenCredits, t);
      await t.meeting.update({ where: { id: meeting.id }, data: { frozenCredits: 0 } });
    });
  }

  if (input.chargeBack && meeting.preConversionId) {
    try {
      await revertPayment({
        creditConversionId: meeting.preConversionId,
        reason: `失敗のオーダー${meeting.id}のチャージバック`,
      });
    } catch (error) {
      logger.fatal(
        { error, meetingId: meeting.id, failureStatus },
        'Payment chargeback failed',
      );
      failureStatus = 'chargeback_fail';
    }
  }

  logger.error(
    { meetingId: meeting.id, status: meeting.status, failureStatus, errorMsg },
    'Meeting failed',
  );
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: { status: failureStatus as never },
  });

  await sendFailureMessages(meeting.id, meeting.ownerId, meeting.conversation?.id ?? null, errorMsg, informParticipants);
}

async function sendFailureMessages(
  meetingId: number,
  ownerId: number,
  conversationId: number | null,
  message: string,
  toWhom: InformTarget,
): Promise<void> {
  if (toWhom === 'nobody') return;

  if (conversationId && toWhom === 'all') {
    await createSystemMessage({ conversationId, content: message, withUnread: true, withBroadcast: true });
    return;
  }

  const recipientIds: number[] = [];
  if (toWhom === 'all' || toWhom === 'owner') recipientIds.push(ownerId);
  if (toWhom === 'all' || toWhom === 'cast') {
    const attendances = await prisma.castAttendance.findMany({
      where: { meetingId, role: { not: 'out' } },
      select: { userId: true },
    });
    recipientIds.push(...attendances.map((attendance) => attendance.userId));
  }

  for (const userId of recipientIds) {
    await systemMessageToUser(userId, { content: message, withUnread: true, withBroadcast: true });
  }
}

/**
 * CancelMeeting — an operator cancelling from the admin panel, optionally with a
 * cancellation fee and a chargeback.
 */
export async function cancelMeeting(input: {
  meetingId: number;
  chargeBack?: boolean;
  cancelFee?: number;
  informParticipants?: InformTarget;
  errorMessage?: string | null;
}): Promise<void> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: input.meetingId },
    include: { owner: { select: { id: true, creditBalance: true } } },
  });

  let chargeBack = input.chargeBack ?? false;
  const cancelFee = input.cancelFee ?? 0;
  const informParticipants = input.informParticipants ?? 'nobody';
  const errorMessage =
    input.errorMessage ||
    '管理画面よりオーダーをキャンセルにいたしました。\nお問い合わせは運営局へご連絡ください。';

  // Only reachable with a fee at or above 100%: charging back as well would take
  // more than the guest ever paid.
  if (cancelFee >= meeting.owner.creditBalance + meeting.frozenCredits) {
    chargeBack = false;
  }

  await handleFailedMeeting({
    meetingId: meeting.id,
    errorMessage,
    failureStatus: 'admin_cancel_fail',
    chargeBack,
    informParticipants,
  });

  if (cancelFee <= 0) return;

  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: meeting.ownerId },
    select: { creditBalance: true },
  });

  // top the balance up if the credits do not cover the fee
  if (owner.creditBalance - cancelFee < 0) {
    await buyCredits({
      userId: meeting.ownerId,
      amount: cancelFee - owner.creditBalance,
      noRounding: true,
      category: 'auto_charge',
      reason: `AutoCharge for penalty of meeting ${meeting.id}`,
    });
  }

  await createCreditTransaction({
    chargedUserId: meeting.ownerId,
    chargedAmount: cancelFee,
    category: 'penalty',
    reason: `Penalty for canceled meeting ${meeting.id}`,
    withBalanceUpdates: true,
  });
}

/** PrepareStickerFinances — the gift equivalent of prepareMeetingFinances. */
export async function prepareStickerFinances(input: {
  buyerId: number;
  recipientId: number;
  price: number;
}): Promise<void> {
  const buyer = await prisma.user.findUniqueOrThrow({
    where: { id: input.buyerId },
    select: { creditBalance: true },
  });

  if (buyer.creditBalance < 0) {
    throw new InteractorFailure('未決済のデータが存在する場合、プレゼントを購入できません');
  }

  const missingCredits = input.price - buyer.creditBalance;
  if (missingCredits <= 0) return;

  await buyCredits({
    userId: input.buyerId,
    amount: missingCredits,
    category: 'auto_charge',
    reason: `ギフトプレゼントのためのオートチャージ 対象ID ${input.recipientId}`,
  });
}

export { transaction };
