import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/posts */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({ category: z.string().optional(), userId: z.coerce.number().optional(), page: z.coerce.number().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.PostWhereInput = {
    ...(query.category ? { category: query.category as never } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
  };

  const [posts, totalCount] = await Promise.all([
    prisma.post.findMany({
      where,
      include: {
        user: { select: { id: true, nickName: true, userType: true } },
        postPictures: true,
        _count: { select: { postLikes: true } },
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.post.count({ where }),
  ]);

  return paginate(posts, totalCount, page, 50);
});
