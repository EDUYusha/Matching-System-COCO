import { z } from 'zod';
import { computeCastPayout } from '@/server/services/payouts';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/ajax_payout_fee */
export const GET = route(async (_request, { searchParams }) => {
  await requireUser();
  const query = z
    .object({ credit_balance: z.coerce.number(), fast_payout: z.string().optional() })
    .parse(queryObject(searchParams));
  return computeCastPayout(query.credit_balance, query.fast_payout === 'true');
});
