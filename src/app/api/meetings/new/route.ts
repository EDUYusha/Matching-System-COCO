import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { assertCanOrder } from '@/server/services/meetings/setup';
import { requireGate } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/new */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireGate('order');
  await assertCanOrder(user.id);

  const query = z.object({ businessAreaId: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const businessArea =
    (query.businessAreaId
      ? await prisma.businessArea.findUnique({ where: { id: query.businessAreaId } })
      : null) ??
    (user.businessAreaId ? await prisma.businessArea.findUnique({ where: { id: user.businessAreaId } }) : null) ??
    (await prisma.businessArea.findFirst({ orderBy: { id: 'asc' } }));
  if (!businessArea) throw new AppError('支店が設定されていません');

  const [areas, castRanks, businessAreas, meetingPreferences] = await Promise.all([
    prisma.area.findMany({ where: { businessAreaId: businessArea.id }, orderBy: { sortIndex: 'asc' } }),
    prisma.castRank.findMany({
      where: { businessAreaId: businessArea.id, baseCostPerTime: { gt: 0 } },
      orderBy: [
        { fixedPrice: 'asc' },
        { proposedPrice: 'asc' },
        { baseCostPerTime: 'asc' },
        { prolongCostPerTime: 'asc' },
      ],
    }),
    prisma.businessArea.findMany({ where: { active: true }, orderBy: { sortIndex: 'asc' } }),
    prisma.meetingPreferencesSchema.findMany({
      where: { active: true, customerPreference: true },
      orderBy: { sortIndex: 'asc' },
    }),
  ]);

  return {
    businessAreas: businessAreas.map((area) => ({ id: area.id, name: area.name, color: area.color })),
    selectedBusinessAreaId: businessArea.id,
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
    meetingPreferences: meetingPreferences.map((preference) => ({
      id: preference.id,
      name: preference.name,
      category: preference.category,
      subcategory: preference.subcategory,
      score: preference.score,
      selected: false,
    })),
    minMeetingDelay: config.min_meeting_delay,
    costTimeInterval: config.cost_time_interval,
  };
});
