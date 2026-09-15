import { z } from 'zod';
import { exchangeCredits } from '@/server/services/buy-credits';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/credits */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      amount: z.coerce.number().int(),
      reason: z.string().optional(),
      cash: z.coerce.number().optional(),
      reflect: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request));

  const result = await exchangeCredits({
    recipientId: params.id,
    amount: body.amount,
    reason: body.reason ?? null,
    receivedYen: body.cash ?? 0,
    reflect: body.reflect ?? 0,
  });
  return { ok: true, ...result };
});
