import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/meetings/:id/discount */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ finalDiscount: z.coerce.number().min(0) }).parse(await jsonBody(request));

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  const capped = Math.min(body.finalDiscount, meeting.finalCosts ?? body.finalDiscount);
  await prisma.meeting.update({ where: { id: meeting.id }, data: { finalDiscount: capped } });
  return { ok: true, finalDiscount: capped };
});
