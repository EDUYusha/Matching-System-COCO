import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/conversations */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({ category: z.string().optional(), userId: z.coerce.number().optional(), page: z.coerce.number().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.ConversationWhereInput = {
    ...(query.category ? { category: query.category as never } : {}),
    ...(query.userId ? { speakers: { some: { userId: query.userId } } } : {}),
  };

  const [conversations, totalCount] = await Promise.all([
    prisma.conversation.findMany({
      where,
      include: { speakers: { include: { user: { select: { id: true, nickName: true, userType: true } } } } },
      orderBy: { updatedAt: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.conversation.count({ where }),
  ]);

  return paginate(conversations, totalCount, page, 50);
});
