import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: GET /users/signup */
export const GET = route(async (_request) => {
  const newUsers = await prisma.user.findMany({
    where: {
      userType: 'cast',
      publicProfile: true,
      discardedAt: null,
      joinDate: { gt: new Date(Date.now() - config.cast_new_duration * 1000) },
      castLevelId: { notIn: [...config.excluded_signup_cast_level_ids] },
    },
    include: { castLevel: true, userAttributes: { select: { name: true, value: true } } },
    orderBy: { lastLogin: 'desc' },
    take: 20,
  });
  return { newUsers: newUsers.map((user) => toUserCard(user)) };
});
