import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import {
  computeCastPayout,
  fastScheduledDateFor,
  payableBalanceFor,
  requestFastPayout,
  requestPayout,
  scheduledDateFor
} from '@/server/services/payouts';
import { requireGate, requirePermission } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/payout */
export const GET = route(async (_request) => {
  const user = await requireGate('payout');
  await requirePermission('payout');

  const [account, balances, pendingRequests] = await Promise.all([
    prisma.castBankAccount.findUnique({ where: { userId: user.id } }),
    payableBalanceFor(user.id),
    prisma.payoutRequest.findMany({
      where: { userId: user.id, status: { in: ['pending', 'on_hold'] } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    creditBalance: balances.creditBalance,
    currentMonthCredits: balances.currentMonthCredits,
    payableBalance: balances.payableBalance,
    scheduledDate: scheduledDateFor(new Date()),
    fastScheduledDate: fastScheduledDateFor(new Date()),
    costs: computeCastPayout(balances.payableBalance, false),
    fastCosts: computeCastPayout(balances.payableBalance, true),
    minNetAmount: config.payout_min_net_amount,
    baseFee: config.payout_base_fee,
    bankAccount: account
      ? {
          bankName: account.bankName,
          bankNumber: account.bankNumber,
          branchName: account.branchName,
          branchNumber: account.branchNumber,
          accountType: account.accountType,
          accountNumber: account.accountNumber,
          holderName: account.holderName,
        }
      : null,
    pendingRequests: pendingRequests.map((payoutRequest) => ({
      id: payoutRequest.id,
      creditAmount: payoutRequest.creditAmount,
      fee: payoutRequest.fee,
      netAmount: payoutRequest.netAmount,
      fastPayout: payoutRequest.fastPayout,
      status: payoutRequest.status as 'pending' | 'on_hold' | 'processed' | 'cancelled',
      handlingType: payoutRequest.handlingType as 'cash' | 'bank_ng' | null,
      scheduledPayoutOn: payoutRequest.scheduledPayoutOn.toISOString().slice(0, 10),
      processedAt: payoutRequest.processedAt ? payoutRequest.processedAt.toISOString() : null,
      createdAt: payoutRequest.createdAt.toISOString(),
    })),
  };
});

/** financial: POST /financial/payout */
export const POST = route(async (request) => {
  const user = await requireGate('payout');
  await requirePermission('payout');
  const body = z
    .object({
      fastPayout: z.boolean().optional(),
      payoutType: z.enum(['full', 'partial']).optional(),
      specifiedNetAmount: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request) ?? {});

  if (body.fastPayout) {
    await requestFastPayout(user.id);
    return {
      ok: true,
      redirect: '/financial/payout',
      flash: { type: 'notice', message: 'すぐ出金申請を受け付けました。3営業日以内に振込いたします。' },
    };
  }

  const { scheduledOn } = await requestPayout(user.id, {
    payoutType: body.payoutType ?? 'full',
    specifiedNetAmount: body.specifiedNetAmount,
  });

  const [year, month, day] = scheduledOn.split('-').map(Number);
  return {
    ok: true,
    redirect: '/financial/payout',
    flash: {
      type: 'notice',
      message: `出金申請を受け付けました。${year}年${month}月${day}日に振込予定です。`,
    },
  };
});
