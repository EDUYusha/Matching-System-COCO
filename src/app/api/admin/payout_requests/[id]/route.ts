import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/payout_requests/:id */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      status: z.enum(['pending', 'on_hold', 'processed', 'cancelled']).optional(),
      handlingType: z.enum(['cash', 'bank_ng']).nullable().optional(),
      scheduledPayoutOn: z.string().optional(),
    })
    .parse(await jsonBody(request));

  await prisma.payoutRequest.update({
    where: { id: params.id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.handlingType !== undefined ? { handlingType: body.handlingType } : {}),
      ...(body.scheduledPayoutOn
        ? { scheduledPayoutOn: new Date(`${body.scheduledPayoutOn}T00:00:00+09:00`) }
        : {}),
    },
  });
  return { ok: true };
});
