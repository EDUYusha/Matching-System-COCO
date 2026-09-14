import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/options */
export const GET = route(async (_request) => {
  await requireAdmin();
  const [businessAreas, areas, castLevels, castRanks, customerLevels, stickerTemplates, trophies, roulettes] =
    await Promise.all([
      prisma.businessArea.findMany({ orderBy: { sortIndex: 'asc' } }),
      prisma.area.findMany({ orderBy: { sortIndex: 'asc' } }),
      prisma.castLevel.findMany({ orderBy: { sortIndex: 'asc' } }),
      prisma.castRank.findMany({ include: { castLevels: true }, orderBy: { baseCostPerTime: 'asc' } }),
      prisma.customerLevel.findMany({ orderBy: { sortIndex: 'asc' } }),
      prisma.stickerTemplate.findMany({ orderBy: { price: 'asc' } }),
      prisma.trophy.findMany({ orderBy: { id: 'asc' } }),
      prisma.roulette.findMany({ include: { customerLevels: true }, orderBy: { sortIndex: 'asc' } }),
    ]);

  return {
    businessAreas,
    areas,
    castLevels,
    castRanks,
    customerLevels,
    stickerTemplates,
    trophies,
    roulettes,
    accessLevels: [
      'rejected',
      'ceased',
      'unauthorized',
      'picture_uploaded',
      'interview_date_pending',
      'interview_pending',
      'contract_pending',
      'contract_accepted',
      'full',
    ],
    userTypes: ['cast', 'customer', 'inviter', 'operator', 'admin', 'system'],
    chargeSteps: config.charge_steps,
  };
});
