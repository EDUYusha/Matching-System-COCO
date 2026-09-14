import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { toUserCard } from '@/server/lib/serializers';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/users */
export const GET = route(async (_request, { searchParams }) => {
  const admin = await requireAdmin();
  const query = z
    .object({
      userType: z.string().optional(),
      accessLevel: z.string().optional(),
      q: z.string().optional(),
      businessAreaId: z.coerce.number().optional(),
      castLevelId: z.coerce.number().optional(),
      discarded: z.string().optional(),
      page: z.coerce.number().optional(),
      perPage: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));

  const page = query.page ?? 1;
  const perPage = Math.min(query.perPage ?? 50, 200);

  const where: Prisma.UserWhereInput = {
    ...(query.userType ? { userType: query.userType as never } : {}),
    ...(query.accessLevel ? { accessLevel: query.accessLevel as never } : {}),
    ...(query.castLevelId ? { castLevelId: query.castLevelId } : {}),
    // a branch admin only sees their own branch
    ...(admin.businessAreaId
      ? { businessAreaId: admin.businessAreaId }
      : query.businessAreaId
        ? { businessAreaId: query.businessAreaId }
        : {}),
    ...(query.discarded === '1' ? { discardedAt: { not: null } } : { discardedAt: null }),
    ...(query.q
      ? {
          OR: [
            { nickName: { contains: query.q, mode: 'insensitive' } },
            { realName: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
            ...(Number.isFinite(Number(query.q)) ? [{ id: Number(query.q) }] : []),
          ],
        }
      : {}),
  };

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { castLevel: true, customerLevel: true, businessArea: true, settings: true },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, perPage),
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(
    users.map((user) => ({
      ...toUserCard(user),
      email: user.email,
      phone: user.phone,
      realName: user.realName,
      accessLevel: user.accessLevel,
      creditBalance: user.creditBalance,
      frozenCredits: user.frozenCredits,
      serviceFeePermille: user.serviceFeePermille,
      businessAreaName: user.businessArea?.name ?? null,
      discardedAt: user.discardedAt?.toISOString() ?? null,
      inviterId: user.inviterId,
      adSource: user.adSource,
      daysElapsed: user.daysElapsed,
      createdAt: user.createdAt.toISOString(),
    })),
    totalCount,
    page,
    perPage,
  );
});
