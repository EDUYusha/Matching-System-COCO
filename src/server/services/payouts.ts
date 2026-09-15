import { config, dbDate, isoDate, PAYOUT_MINIMUM_DATE, tokyoParts, tokyoStartOfMonth, toI } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { AppError, InteractorFailure } from '@/server/lib/errors';
import { createCreditConversion, createCreditTransaction } from '@/server/services/credits';

/**
 * Ports ComputeCastPayout, CreatePayoutTransactions, MakePayout and the payout
 * screens' rules from FinancialController.
 *
 * Two payout paths coexist, by design:
 *   すぐ出金 (fast)  — the old automatic flow; MakePayout writes a CreditConversion
 *                     immediately and the money goes out within three business days
 *   通常申請        — since 2026-05, an application (PayoutRequest) the operator
 *                     processes on the 25th
 *
 * Both deduct the credits at application time so the balance and the history
 * reflect the request straight away and cannot be spent twice.
 */

export interface PayoutCosts {
  fee: number;
  netOut: number;
}

/**
 * ComputeCastPayout.
 *
 * Fast payouts pay a percentage plus the base fee, capped; ordinary applications
 * pay only the flat base fee.
 */
export function computeCastPayout(creditAmount: number, fastPayout = false): PayoutCosts {
  const fee = fastPayout
    ? Math.min(
        toI(creditAmount * config.payout_fee_multiplier) + config.payout_base_fee,
        config.payout_max_fee,
      )
    : config.payout_base_fee;
  return { fee, netOut: creditAmount - fee };
}

/**
 * PayoutRequest.scheduled_date_for — applications up to the 15th are paid on the
 * 25th of the same month, later ones on the 25th of the next, never earlier than
 * the scheme's start date.
 */
export function scheduledDateFor(requestedAt: Date = new Date()): string {
  const t = tokyoParts(requestedAt);
  let year = t.year;
  let month = t.month;
  if (t.day > 15) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const candidate = `${year}-${String(month).padStart(2, '0')}-25`;
  return candidate > PAYOUT_MINIMUM_DATE ? candidate : PAYOUT_MINIMUM_DATE;
}

/** PayoutRequest.fast_scheduled_date_for — three business days out. */
export function fastScheduledDateFor(requestedAt: Date = new Date()): string {
  const t = tokyoParts(requestedAt);
  const candidate = new Date(Date.UTC(t.year, t.month - 1, t.day));
  let added = 0;
  while (added < 3) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    const weekday = candidate.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return candidate.toISOString().slice(0, 10);
}

/**
 * The credits a cast may withdraw: the balance minus what they earned this month.
 *
 * Payout-category rows are excluded from the "earned this month" figure on
 * purpose — a cancelled application's reversing entry would otherwise look like
 * fresh earnings and lock the credits up for another month.
 */
export async function payableBalanceFor(userId: number, tx?: Tx): Promise<{
  creditBalance: number;
  currentMonthCredits: number;
  payableBalance: number;
}> {
  const client = tx ?? prisma;
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { creditBalance: true },
  });
  const monthStart = tokyoStartOfMonth(new Date());
  const aggregate = await client.creditTransaction.aggregate({
    where: {
      creditedUserId: userId,
      createdAt: { gte: monthStart },
      category: { not: 'payout' },
    },
    _sum: { creditedAmount: true },
  });
  const currentMonthCredits = aggregate._sum.creditedAmount ?? 0;
  return {
    creditBalance: user.creditBalance,
    currentMonthCredits,
    payableBalance: Math.max(user.creditBalance - currentMonthCredits, 0),
  };
}

/** CreatePayoutTransactions — the fast path's ledger rows. */
export async function createPayoutTransactions(
  input: { userId: number; creditAmount: number; netOut: number; fastPayout?: boolean },
  tx?: Tx,
): Promise<{ creditTransactionId: number; creditConversionId: number }> {
  if (input.netOut <= 0) throw new InteractorFailure('手数料が支払いよりも高いです。');

  const user = await (tx ?? prisma).user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { nickName: true },
  });

  return transaction(tx, async (t) => {
    const ct = await createCreditTransaction(
      {
        chargedUserId: input.userId,
        chargedAmount: input.creditAmount,
        category: 'payout',
        reason: `出金処理 対象者 ${user.nickName}`,
        withBalanceUpdates: true,
      },
      t,
    );
    const cc = await createCreditConversion(
      {
        creditTransactionId: ct.id,
        userId: input.userId,
        amount: input.netOut,
        currency: 'jpy',
        credits: input.creditAmount,
        flowDirection: input.fastPayout ? 'fast_out' : 'out',
        checked: false,
      },
      t,
    );
    return { creditTransactionId: ct.id, creditConversionId: cc.id };
  });
}

/** MakePayout — ComputeCastPayout then CreatePayoutTransactions. */
export async function makePayout(input: {
  userId: number;
  creditAmount: number;
  fastPayout?: boolean;
}): Promise<{ creditTransactionId: number; creditConversionId: number; costs: PayoutCosts }> {
  const costs = computeCastPayout(input.creditAmount, input.fastPayout);
  const result = await createPayoutTransactions(
    { userId: input.userId, creditAmount: input.creditAmount, netOut: costs.netOut, fastPayout: input.fastPayout },
    undefined,
  );
  return { ...result, costs };
}

/** FinancialController#record_payout, fast branch. */
export async function requestFastPayout(userId: number): Promise<void> {
  const { creditBalance } = await payableBalanceFor(userId);
  // fast payouts ignore the monthly restriction and take the whole balance
  if (creditBalance <= 0) throw new AppError('出金可能なポイントがありません');

  const costs = computeCastPayout(creditBalance, true);
  const minNet = config.payout_min_net_amount;
  if (costs.netOut < minNet) {
    throw new AppError(
      `振込金額が${minNet}円未満のため申請できません（手数料差引後の最低額：${minNet}円）`,
    );
  }

  await makePayout({ userId, creditAmount: creditBalance, fastPayout: true });
}

/** FinancialController#record_payout, ordinary application branch. */
export async function requestPayout(
  userId: number,
  input: { payoutType: 'full' | 'partial'; specifiedNetAmount?: number },
): Promise<{ scheduledOn: string }> {
  const existing = await prisma.payoutRequest.findFirst({
    where: { userId, status: { in: ['pending', 'on_hold'] } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError('すでに申請中の出金があります。処理完了後に再度申請してください。');
  }

  const { payableBalance } = await payableBalanceFor(userId);
  const fee = config.payout_base_fee;
  const minNet = config.payout_min_net_amount;

  let creditAmount: number;
  let netAmount: number;

  if (input.payoutType === 'partial') {
    const specifiedNet = input.specifiedNetAmount ?? 0;
    if (specifiedNet < minNet) throw new AppError(`振込金額は${minNet}円以上で指定してください`);
    creditAmount = specifiedNet + fee;
    if (creditAmount > payableBalance) {
      throw new AppError(
        `指定金額が出金可能残高を超えています（最大 ${Math.max(payableBalance - fee, 0)}円）`,
      );
    }
    netAmount = specifiedNet;
  } else {
    creditAmount = payableBalance;
    if (creditAmount <= 0) {
      throw new AppError('出金可能なポイントがありません（当月獲得分は翌月以降に出金できます）');
    }
    netAmount = Math.max(creditAmount - fee, 0);
    if (netAmount < minNet) {
      throw new AppError(
        `振込金額が${minNet}円未満のため申請できません（手数料${fee}円差引後の最低額：${minNet}円／必要ポイント：${minNet + fee}P以上）`,
      );
    }
  }

  const scheduledOn = scheduledDateFor(new Date());

  await prisma.$transaction(async (t) => {
    const ct = await createCreditTransaction(
      {
        chargedUserId: userId,
        chargedAmount: creditAmount,
        category: 'payout',
        reason: '出金申請（申請受付）',
        withBalanceUpdates: true,
      },
      t,
    );
    await t.payoutRequest.create({
      data: {
        userId,
        creditAmount,
        fee,
        netAmount,
        fastPayout: false,
        status: 'pending',
        scheduledPayoutOn: dbDate(scheduledOn),
        creditTransactionId: ct.id,
      },
    });
  });

  return { scheduledOn };
}

/**
 * FinancialController#hold_payout — parks the credits without a transfer, for
 * cast who want to bank them until an operator releases the hold.
 */
export async function holdPayout(userId: number): Promise<void> {
  const { payableBalance } = await payableBalanceFor(userId);
  if (payableBalance <= 0) {
    throw new AppError('保留できるポイントがありません（当月獲得分は翌月以降に出金できます）');
  }

  const existing = await prisma.payoutRequest.findFirst({
    where: { userId, status: { in: ['pending', 'on_hold'] } },
    select: { id: true },
  });
  if (existing) throw new AppError('すでに申請中の出金があります。');

  const scheduledOn = scheduledDateFor(new Date());

  await prisma.$transaction(async (t) => {
    const ct = await createCreditTransaction(
      {
        chargedUserId: userId,
        chargedAmount: payableBalance,
        category: 'payout',
        reason: '出金申請（保留受付）',
        withBalanceUpdates: true,
      },
      t,
    );
    await t.payoutRequest.create({
      data: {
        userId,
        creditAmount: payableBalance,
        fee: 0,
        netAmount: payableBalance,
        fastPayout: false,
        status: 'on_hold',
        scheduledPayoutOn: dbDate(scheduledOn),
        creditTransactionId: ct.id,
      },
    });
  });
}

/**
 * Admin side: releases a held application (保留解除). The transfer date is worked
 * out again from the release date; the one from hold time can be a 25th that has
 * already passed, which the transfer CSV would never pick up.
 */
export async function releasePayoutHold(payoutRequestId: number, releasedAt: Date = new Date()): Promise<void> {
  const { count } = await prisma.payoutRequest.updateMany({
    where: { id: payoutRequestId, status: 'on_hold' },
    data: { status: 'pending', scheduledPayoutOn: dbDate(scheduledDateFor(releasedAt)) },
  });
  if (count === 0) throw new AppError('保留中の申請ではありません');
}

/**
 * Admin side: marks an application transferred and books the conversion, so the
 * company cash balance moves on the day the money actually leaves.
 */
export async function processPayoutRequest(payoutRequestId: number): Promise<void> {
  const request = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: payoutRequestId } });
  if (request.status === 'processed') throw new AppError('この申請はすでに処理済みです');
  if (request.status === 'cancelled') throw new AppError('この申請は取消済みです');
  if (!request.creditTransactionId) throw new AppError('この申請には取引が紐付いていません');

  await prisma.$transaction(async (t) => {
    const cc = await createCreditConversion(
      {
        creditTransactionId: request.creditTransactionId!,
        userId: request.userId,
        amount: request.netAmount,
        currency: 'jpy',
        credits: request.creditAmount,
        flowDirection: request.fastPayout ? 'fast_out' : 'out',
        checked: true,
      },
      t,
    );
    await t.payoutRequest.update({
      where: { id: request.id },
      data: { status: 'processed', processedAt: new Date(), creditConversionId: cc.id },
    });
  });
}

/**
 * Admin side: cancels an application and returns the credits, which is why the
 * reversing row is also category 'payout' (see payableBalanceFor).
 */
export async function cancelPayoutRequest(payoutRequestId: number, reason?: string): Promise<void> {
  const request = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: payoutRequestId } });
  if (request.status === 'processed') throw new AppError('振込済みの申請は取消できません');
  if (request.status === 'cancelled') return;

  await prisma.$transaction(async (t) => {
    await createCreditTransaction(
      {
        creditedUserId: request.userId,
        creditedAmount: request.creditAmount,
        category: 'payout',
        reason: reason ?? '出金申請の取消（ポイント返還）',
        withBalanceUpdates: true,
      },
      t,
    );
    await t.payoutRequest.update({ where: { id: request.id }, data: { status: 'cancelled' } });
  });
}

/** The bank transfer CSV excludes cash handovers and unusable bank details. */
export async function transferablePayoutRequests(scheduledOn?: string) {
  return prisma.payoutRequest.findMany({
    where: {
      status: 'pending',
      handlingType: null,
      ...(scheduledOn ? { scheduledPayoutOn: dbDate(scheduledOn) } : {}),
    },
    include: {
      user: {
        select: { id: true, nickName: true, realName: true, castBankAccount: true },
      },
    },
    orderBy: { id: 'asc' },
  });
}

export { isoDate };
