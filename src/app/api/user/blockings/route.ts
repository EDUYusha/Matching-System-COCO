import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: GET /user/blockings */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const blockings = await prisma.blocking.findMany({
    where: { userId: user.id },
    include: { target: { include: { castLevel: true, customerLevel: true } } },
    orderBy: { id: 'desc' },
  });
  return {
    blockings: blockings.map((blocking) => ({
      id: blocking.id,
      createdAt: blocking.createdAt.toISOString(),
      target: toUserCard(blocking.target),
    })),
  };
});
