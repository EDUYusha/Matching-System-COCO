import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/cast_attendances/:id */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      startTime: z.string().nullable().optional(),
      endTime: z.string().nullable().optional(),
      role: z.enum(['attending', 'unconfirmed', 'requested', 'out']).optional(),
      serviceFeePermille: z.coerce.number().nullable().optional(),
      additionalScore: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request));

  await prisma.castAttendance.update({
    where: { id: params.id },
    data: {
      ...(body.startTime !== undefined ? { startTime: body.startTime ? new Date(body.startTime) : null } : {}),
      ...(body.endTime !== undefined ? { endTime: body.endTime ? new Date(body.endTime) : null } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.serviceFeePermille !== undefined ? { serviceFeePermille: body.serviceFeePermille } : {}),
      ...(body.additionalScore !== undefined ? { additionalScore: body.additionalScore } : {}),
    },
  });
  return { ok: true };
});
