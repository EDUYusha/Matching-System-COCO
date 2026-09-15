import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: GET /profile/footprints */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireUser();
  const page = Number((queryObject(searchParams) as { page?: string }).page) || 1;
  const pagination = paginationArgs(page, 30);

  const visitorTypes =
    user.userType === 'cast' ? (['customer', 'inviter'] as const) : (['cast'] as const);

  const where = {
    profileUserId: user.id,
    user: { discardedAt: null, userType: { in: [...visitorTypes] } },
  };

  const [footprints, totalCount] = await Promise.all([
    prisma.footprint.findMany({
      where,
      include: { user: { include: { castLevel: true, customerLevel: true } } },
      orderBy: { id: 'desc' },
      ...pagination,
    }),
    prisma.footprint.count({ where }),
  ]);

  return paginate(
    footprints.map((footprint) => ({
      id: footprint.id,
      createdAt: footprint.createdAt.toISOString(),
      unread: footprint.unread,
      user: toUserCard(footprint.user),
    })),
    totalCount,
    page,
    30,
  );
});
