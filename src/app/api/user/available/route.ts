import { tokyoParts, tokyoStartOfDay } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: POST /user/available */
export const POST = route(async (_request) => {
  const user = await requireUser();
  const now = new Date();
  const todayAtFour = tokyoStartOfDay(now, 4);
  const endTime =
    tokyoParts(now).hour < 4 ? todayAtFour : new Date(todayAtFour.getTime() + 24 * 60 * 60 * 1000);

  await prisma.user.update({ where: { id: user.id }, data: { availableUntil: endTime } });
  return { ok: true, redirect: '/meetings', availableUntil: endTime.toISOString() };
});
