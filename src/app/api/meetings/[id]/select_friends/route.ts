import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id/select_friends */
export const GET = route<{ id: string }>(async (_request) => {
  const user = await requireUser();
  const friendships = await prisma.friendship.findMany({
    where: { userId: user.id, mutual: true, friend: { userType: 'cast', discardedAt: null } },
    include: { friend: { include: { castLevel: true } } },
  });
  return { friends: friendships.map((friendship) => toUserCard(friendship.friend)) };
});
