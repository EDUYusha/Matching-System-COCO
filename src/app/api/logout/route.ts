import { prisma } from '@/server/lib/prisma';
import { clearSession, currentUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: POST /logout */
export const POST = route(async (_request) => {
  const user = (await currentUser());
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { loggedOut: true, authToken: null, rememberToken: null },
    });
  }
  await clearSession();
  return { ok: true, redirect: '/', flash: { type: 'notice', message: 'ログアウトしました' } };
});
