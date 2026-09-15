import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { serviceMessagesFor, toServiceMessageDto } from '@/server/services/service-messages';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: GET /user/settings */
export const GET = route(async (_request) => {
  const user = await requireUser();

  const isGuest = user.userType === 'customer' || user.userType === 'inviter' || user.userType === 'admin';
  const isCast = user.userType === 'cast' || user.userType === 'admin';

  const patronizedCast = isGuest
    ? await prisma.user.findMany({
        where: {
          userType: 'cast',
          firstPrivatelyMetUserId: user.id,
          firstPrivatelyMetAt: { not: null },
          discardedAt: null,
        },
        include: { castLevel: true },
      })
    : [];

  const lastTransaction = isGuest
    ? await prisma.creditTransaction.findFirst({
        where: { OR: [{ chargedUserId: user.id }, { creditedUserId: user.id }] },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const patron =
    isCast && user.firstPrivatelyMetAt && user.firstPrivatelyMetUserId
      ? await prisma.user.findUnique({
          where: { id: user.firstPrivatelyMetUserId },
          include: { customerLevel: true },
        })
      : null;

  const firstCustomers = isCast
    ? await prisma.user.findMany({
        where: { userType: { in: ['customer', 'inviter'] }, firstPrivatelyMetUserId: user.id, discardedAt: null },
        include: { customerLevel: true },
      })
    : [];

  const messages = await serviceMessagesFor(user, { take: 3 });

  return {
    patronizedCast: patronizedCast.map((cast) => toUserCard(cast)),
    lastTransactionAt: lastTransaction?.createdAt.toISOString() ?? null,
    patron: patron ? toUserCard(patron) : null,
    firstCustomers: firstCustomers.map((customer) => toUserCard(customer)),
    serviceMessages: messages.map((message) => toServiceMessageDto(message, user.lastServiceMessageReadAt)),
  };
});
