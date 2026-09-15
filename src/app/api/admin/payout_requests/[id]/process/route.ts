import { z } from 'zod';
import { processPayoutRequest } from '@/server/services/payouts';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/payout_requests/:id/process */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await processPayoutRequest(params.id);
  return { ok: true };
});
