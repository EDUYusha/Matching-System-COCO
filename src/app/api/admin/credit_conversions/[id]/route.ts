import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/credit_conversions/:id */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ checked: z.boolean() }).parse(await jsonBody(request));
  await prisma.creditConversion.update({ where: { id: params.id }, data: { checked: body.checked } });
  return { ok: true };
});
