import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /business_areas/:id/areas */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const [areas, castRanks] = await Promise.all([
    prisma.area.findMany({ where: { businessAreaId: params.id }, orderBy: { sortIndex: 'asc' } }),
    prisma.castRank.findMany({ where: { businessAreaId: params.id }, orderBy: { baseCostPerTime: 'asc' } }),
  ]);

  return {
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      businessAreaId: area.businessAreaId,
      custom: area.custom,
    })),
    castRanks: castRanks.map((rank) => ({
      id: rank.id,
      name: rank.name,
      baseCostPerTime: rank.baseCostPerTime,
      prolongCostPerTime: rank.prolongCostPerTime,
      proposedPrice: rank.proposedPrice,
      fixedPrice: rank.fixedPrice,
    })),
  };
});
