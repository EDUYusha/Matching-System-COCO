import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/assessments */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ name: z.string(), value: z.string() }).parse(await jsonBody(request));

  await prisma.userAssessment.upsert({
    where: { userId_name: { userId: params.id, name: body.name } },
    create: { userId: params.id, name: body.name, value: body.value },
    update: { value: body.value },
  });
  return { ok: true };
});
