import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { createBlocking } from '@/server/services/blockings';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/blockings */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z.object({ page: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const page = query.page ?? 1;
  const [blockings, totalCount] = await Promise.all([
    prisma.blocking.findMany({
      include: {
        user: { select: { id: true, nickName: true } },
        target: { select: { id: true, nickName: true } },
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.blocking.count(),
  ]);
  return paginate(blockings, totalCount, page, 50);
});

/** admin: POST /admin/blockings */
export const POST = route(async (request) => {
  await requireAdmin();
  const body = z.object({ userId: z.coerce.number(), targetId: z.coerce.number() }).parse(await jsonBody(request));
  await createBlocking(body.userId, body.targetId);
  return { ok: true };
});
