import { config } from '@/lib';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { toUserCard } from '@/server/lib/serializers';
import { searchProfileIds, searchableUserTypes } from '@/server/services/profile-search';
import { requireGate } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
import { loadHighlightings } from '@/server/api/profiles-shared';
export const dynamic = 'force-dynamic';

/** profiles: GET /profiles/search */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireGate('search');
  const query = queryObject(searchParams) as Record<string, string | undefined>;
  const page = Number(query.page) || 1;
  const pagination = paginationArgs(page, 20);

  const { ids, totalCount } = await searchProfileIds(prisma, user, query, pagination);

  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        include: {
          castLevel: true,
          customerLevel: true,
          userAttributes: { select: { name: true, value: true } },
        },
      })
    : [];
  // preserve the ordering the search query produced
  const ordered = ids.map((id) => users.find((candidate) => candidate.id === id)).filter((u): u is typeof users[number] => !!u);

  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id, targetId: { in: ids } },
    select: { targetId: true },
  });
  const favoriteIds = new Set(favorites.map((favorite) => favorite.targetId));

  const lookupUserTypes = searchableUserTypes(user.userType);

  // the extra blocks the search screen renders when no filter is applied
  const hasFilters = Object.entries(query).some(
    ([key, value]) => key !== 'page' && value !== undefined && value !== '',
  );

  let newUsers: typeof users = [];
  let highlightings: Awaited<ReturnType<typeof loadHighlightings>> = [];
  let castLevels: Array<{ id: number; name: string; color: string; sortIndex: number; memberCount: number }> = [];

  if (!hasFilters) {
    if (user.userType === 'customer' || user.userType === 'inviter' || user.userType === 'admin') {
      newUsers = await prisma.user.findMany({
        where: {
          userType: 'cast',
          publicProfile: true,
          discardedAt: null,
          joinDate: { gt: new Date(Date.now() - config.cast_new_duration * 1000) },
        },
        include: { castLevel: true, customerLevel: true, userAttributes: { select: { name: true, value: true } } },
        orderBy: { lastLogin: 'desc' },
        take: 20,
      });

      const levelRows = await prisma.$queryRaw<
        Array<{ id: number; name: string; color: string; sort_index: number; member_count: bigint }>
      >(Prisma.sql`
        SELECT cast_levels.id, cast_levels.name, cast_levels.color, cast_levels.sort_index,
               COUNT(users.id) AS member_count
        FROM cast_levels
        LEFT JOIN users ON users.cast_level_id = cast_levels.id AND users.discarded_at IS NULL
        WHERE cast_levels.sort_index <= 100
        GROUP BY cast_levels.id
        ORDER BY cast_levels.sort_index ASC
      `);
      castLevels = levelRows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        sortIndex: row.sort_index,
        memberCount: Number(row.member_count),
      }));
    } else if (user.userType === 'cast') {
      newUsers = await prisma.user.findMany({
        where: {
          userType: 'customer',
          publicProfile: true,
          discardedAt: null,
          joinDate: { gt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          firstPrivatelyMetUserId: null,
        },
        include: { castLevel: true, customerLevel: true, userAttributes: { select: { name: true, value: true } } },
        orderBy: [{ joinDate: 'desc' }, { id: 'desc' }],
        take: 40,
      });
    }

    highlightings = await loadHighlightings(lookupUserTypes);
  }

  // the filter dropdowns' option lists
  const [mpsSchema, attrSchema, businessAreas] = await Promise.all([
    prisma.meetingPreferencesSchema.findMany({
      where: { subcategory: { in: ['年齢', '身長', 'スタイル', 'ルックス', 'タイプ', '職業', 'タバコ', '英語'] } },
      orderBy: { sortIndex: 'asc' },
    }),
    prisma.attributesSchema.findMany({ where: { name: { in: ['年収'] } } }),
    prisma.businessArea.findMany({ where: { active: true }, orderBy: { sortIndex: 'asc' } }),
  ]);

  const mpsBySubcategory: Record<string, Array<{ id: number; name: string | null }>> = {};
  for (const row of mpsSchema) {
    const key = row.subcategory ?? '';
    mpsBySubcategory[key] = mpsBySubcategory[key] ?? [];
    mpsBySubcategory[key].push({ id: row.id, name: row.name });
  }

  const { normaliseValueList } = await import('@/server/services/users');

  return {
    ...paginate(
      ordered.map((candidate) => toUserCard(candidate, { favorited: favoriteIds.has(candidate.id) })),
      totalCount,
      page,
      20,
    ),
    newUsers: newUsers.map((candidate) => toUserCard(candidate, { favorited: favoriteIds.has(candidate.id) })),
    highlightings,
    castLevels,
    filterOptions: {
      meetingPreferences: mpsBySubcategory,
      attributes: Object.fromEntries(
        attrSchema.map((row) => [row.name, normaliseValueList(row.valueList) ?? []]),
      ),
      businessAreas: businessAreas.map((area) => ({ id: area.id, name: area.name, color: area.color })),
    },
  };
});
