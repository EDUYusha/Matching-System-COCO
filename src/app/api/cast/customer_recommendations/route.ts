import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: GET /cast/customer_recommendations */
export const GET = route(async (_request) => {
  const user = await requireUser();
  if (user.userType !== 'cast' || user.customersSelected) {
    throw new AppError('その操作はできません。', { statusCode: 403 });
  }

  const users = await prisma.user.findMany({
    where: { userType: { in: ['customer', 'inviter'] }, publicProfile: true, discardedAt: null },
    include: { customerLevel: true, userAttributes: { select: { name: true, value: true } } },
    orderBy: { lastActivity: 'desc' },
    take: 50,
  });

  return { users: users.map((candidate) => toUserCard(candidate)) };
});
