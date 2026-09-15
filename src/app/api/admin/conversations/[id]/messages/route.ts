import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/conversations/:id/messages */
export const GET = route<{ id: string }>(async (_request, { params: routeParams, searchParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const query = z.object({ page: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const [messages, totalCount] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: params.id },
      include: { sender: { select: { id: true, nickName: true, userType: true } } },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 100),
    }),
    prisma.message.count({ where: { conversationId: params.id } }),
  ]);

  return paginate(messages, totalCount, page, 100);
});
