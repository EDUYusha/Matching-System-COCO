import { z } from 'zod';
import { isoDate } from '@/lib';
import { requireAdmin } from '@/server/api/admin-scope';
import { transferablePayoutRequests } from '@/server/services/payouts';
import { csvResponse } from '@/server/api/csv';
import { query, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/payout_requests.csv — the bank transfer file. */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const params = query(searchParams, z.object({ scheduledOn: z.string().optional() }));

  const requests = await transferablePayoutRequests(params.scheduledOn);

  const header = [
    'payout_request_id', 'user_id', 'nick_name', 'real_name', 'bank_name', 'bank_number',
    'branch_name', 'branch_number', 'account_type', 'account_number', 'holder_name',
    'net_amount', 'credit_amount', 'fee', 'scheduled_payout_on',
  ];
  const rows = requests.map((payoutRequest) => [
    payoutRequest.id,
    payoutRequest.user.id,
    payoutRequest.user.nickName,
    payoutRequest.user.realName ?? '',
    payoutRequest.user.castBankAccount?.bankName ?? '',
    payoutRequest.user.castBankAccount?.bankNumber ?? '',
    payoutRequest.user.castBankAccount?.branchName ?? '',
    payoutRequest.user.castBankAccount?.branchNumber ?? '',
    payoutRequest.user.castBankAccount?.accountType ?? '',
    payoutRequest.user.castBankAccount?.accountNumber ?? '',
    payoutRequest.user.castBankAccount?.holderName ?? '',
    payoutRequest.netAmount,
    payoutRequest.creditAmount,
    payoutRequest.fee,
    isoDate(payoutRequest.scheduledPayoutOn),
  ]);

  return csvResponse([header, ...rows], `payout-requests-${isoDate(new Date())}.csv`);
});
