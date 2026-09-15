import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PUT /admin/cast_ranks/:id/cast_levels */
export const PUT = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ castLevelIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  await prisma.$transaction(async (t) => {
    await t.castLevelsRank.deleteMany({ where: { castRankId: params.id } });
    if (body.castLevelIds.length) {
      await t.castLevelsRank.createMany({
        data: body.castLevelIds.map((castLevelId) => ({ castRankId: params.id, castLevelId })),
        skipDuplicates: true,
      });
    }
  });
  return { ok: true };
});
