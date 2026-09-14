import { z } from 'zod';
import { cancelPayoutRequest } from '@/server/services/payouts';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/payout_requests/:id/cancel */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ reason: z.string().optional() }).parse(await jsonBody(request) ?? {});
  await cancelPayoutRequest(params.id, body.reason);
  return { ok: true };
});
