import { z } from 'zod';
import { numberToCredits } from '@/lib';
import { computeCastPayout } from '@/server/services/payouts';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/payout_preview */
export const GET = route(async (_request, { searchParams }) => {
  await requireUser();
  const query = z
    .object({ credits: z.coerce.number(), fast: z.string().optional() })
    .parse(queryObject(searchParams));
  const costs = computeCastPayout(query.credits, query.fast === 'true');
  return { ...costs, label: numberToCredits(query.credits) };
});
