import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: POST /user/unavailable */
export const POST = route(async (_request) => {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { availableUntil: null } });
  return { ok: true, redirect: '/meetings' };
});
