import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PUT /admin/roulettes/:id/customer_levels */
export const PUT = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ customerLevelIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  await prisma.$transaction(async (t) => {
    await t.customerLevelsRoulette.deleteMany({ where: { rouletteId: params.id } });
    if (body.customerLevelIds.length) {
      await t.customerLevelsRoulette.createMany({
        data: body.customerLevelIds.map((customerLevelId) => ({ rouletteId: params.id, customerLevelId })),
        skipDuplicates: true,
      });
    }
  });
  return { ok: true };
});
