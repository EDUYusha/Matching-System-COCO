import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/reviews */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({ revieweeId: z.coerce.number().optional(), stars: z.coerce.number().optional(), page: z.coerce.number().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.ReviewWhereInput = {
    ...(query.revieweeId ? { revieweeId: query.revieweeId } : {}),
    ...(query.stars ? { stars: query.stars } : {}),
  };

  const [reviews, totalCount] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        reviewer: { select: { id: true, nickName: true, userType: true } },
        reviewee: { select: { id: true, nickName: true, userType: true } },
        meeting: { select: { id: true, plannedStartTime: true } },
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.review.count({ where }),
  ]);

  return paginate(reviews, totalCount, page, 50);
});
