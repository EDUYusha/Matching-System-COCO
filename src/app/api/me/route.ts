import { prisma } from '@/server/lib/prisma';
import { requiredAction } from '@/server/auth/session';
import { toCurrentUser } from '@/server/lib/serializers';
import { currentUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: GET /me */
export const GET = route(async (_request) => {
  const current = (await currentUser());
  if (!current) return { user: null, requiredAction: null };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: current.id },
    include: { businessArea: true, castLevel: true, customerLevel: true, settings: true },
  });

  return { user: toCurrentUser(user), requiredAction: requiredAction(user) };
});
