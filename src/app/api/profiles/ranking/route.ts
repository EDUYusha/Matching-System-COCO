import { z } from 'zod';
import { type RankingCategory, type RankingPeriod } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { toLevelRef, toRankingRow } from '@/server/lib/serializers';
import {
  creditsRanking,
  eventChocoReceivedCountRanking,
  limitedEventGiftRanking
} from '@/server/services/rankings';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: GET /profiles/ranking */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireUser();
  const query = z
    .object({
      category: z.string().optional(),
      user_type: z.string().optional(),
      period: z.string().optional(),
      limited_sticker_template_ids: z.string().optional(),
    })
    .parse(queryObject(searchParams));

  let category = (query.category || 'credits') as RankingCategory;
  let userType = (query.user_type || user.userType) as string;
  if (!['cast', 'customer', 'inviter'].includes(userType)) userType = user.userType;
  if (userType === 'inviter') userType = 'customer';
  let period = (query.period || 'yesterday') as RankingPeriod;

  const hasActiveCampaign = !!(await prisma.eventCampaign.findFirst({
    where: { startAt: { lte: new Date() }, endAt: { gte: new Date() } },
  }));

  // the limited-time rankings are scoped to an event, not a calendar window
  if (category === 'limited_event' && !['this_month', 'prev_month', 'event_period'].includes(period)) {
    period = hasActiveCampaign ? 'event_period' : 'this_month';
  }
  if (
    category === 'event_choco_count' &&
    !['this_month', 'prev_month', 'event_period', 'this_week'].includes(period)
  ) {
    period = hasActiveCampaign ? 'event_period' : 'this_month';
  }
  // each audience has its own limited-time ranking; switching tab switches category
  if (category === 'event_choco_count' && userType === 'cast') category = 'limited_event';
  if (category === 'limited_event' && userType === 'customer') category = 'event_choco_count';

  const viewer = { id: user.id, userType: user.userType };
  let rows: Awaited<ReturnType<typeof creditsRanking>>['rows'] = [];
  let myRankingRaw: Awaited<ReturnType<typeof creditsRanking>>['myRanking'] = null;
  let campaign: { id: number; name: string; startAt: Date; endAt: Date } | null = null;

  if (category === 'limited_event') {
    userType = 'cast';
    const ids = (query.limited_sticker_template_ids ?? '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id));
    const result = await limitedEventGiftRanking({
      category,
      period,
      userType: 'cast',
      viewerId: user.id,
      stickerTemplateIds: ids,
    });
    rows = result.rows;
    myRankingRaw = result.myRanking;
    campaign = result.campaign;
  } else if (category === 'event_choco_count') {
    const result = await eventChocoReceivedCountRanking({
      category,
      period,
      userType: 'customer',
      viewerId: user.id,
    });
    rows = result.rows;
    myRankingRaw = result.myRanking;
    campaign = result.campaign;
  } else {
    const result = await creditsRanking({
      category,
      period,
      userType: userType as 'cast' | 'customer',
      viewerId: user.id,
    });
    rows = result.rows;
    myRankingRaw = result.myRanking;
  }

  const userIds = [...rows.map((row) => row.user_id), ...(myRankingRaw ? [myRankingRaw.user_id] : [])];
  const [settings, castLevels, customerLevels] = await Promise.all([
    prisma.userSettings.findMany({ where: { userId: { in: userIds } } }),
    prisma.castLevel.findMany(),
    prisma.customerLevel.findMany(),
  ]);

  const levelFor = (levelId: number | null, rowUserType: string) => {
    if (levelId === null) return null;
    const pool = rowUserType === 'cast' ? castLevels : customerLevels;
    return toLevelRef(pool.find((level) => level.id === levelId) ?? null);
  };
  const noRankingFor = (userId: number) =>
    settings.find((setting) => setting.userId === userId)?.noRanking ?? false;

  const serialised = rows.map((row) =>
    toRankingRow(row, {
      viewer,
      level: levelFor(row.user_level_id, row.user_type),
      noRanking: noRankingFor(row.user_id),
    }),
  );
  const myRanking = myRankingRaw
    ? toRankingRow(myRankingRaw, {
        viewer,
        level: levelFor(myRankingRaw.user_level_id, myRankingRaw.user_type),
        noRanking: false,
      })
    : null;

  return {
    category,
    period,
    userType,
    rows: serialised,
    myRanking,
    myRankingInTopThirty: serialised.some((row) => row.userId === user.id),
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          startAt: campaign.startAt.toISOString(),
          endAt: campaign.endAt.toISOString(),
        }
      : null,
  };
});
