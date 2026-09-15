import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: GET /users/cast_recommendations */
export const GET = route(async (_request) => {
  await requireUser();
  const cast = await prisma.user.findMany({
    where: { userType: 'cast', publicProfile: true, discardedAt: null },
    include: { castLevel: true, userAttributes: { select: { name: true, value: true } } },
    orderBy: { lastActivity: 'desc' },
    take: 50,
  });
  return { cast: cast.map((user) => toUserCard(user)) };
});
