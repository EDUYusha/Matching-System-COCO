import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PUT /admin/meeting_places/:id/tags */
export const PUT = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ tagIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  await prisma.$transaction(async (t) => {
    await t.meetingPlaceTagEntry.deleteMany({ where: { meetingPlaceId: params.id } });
    if (body.tagIds.length) {
      await t.meetingPlaceTagEntry.createMany({
        data: body.tagIds.map((meetingPlaceTagId) => ({ meetingPlaceId: params.id, meetingPlaceTagId })),
        skipDuplicates: true,
      });
    }
  });
  return { ok: true };
});
