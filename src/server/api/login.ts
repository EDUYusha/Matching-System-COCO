import type { User } from '@prisma/client';
import { access } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { toCurrentUser } from '@/server/lib/serializers';
import { newRememberToken, requiredAction, setRememberToken, setSession } from '@/server/auth/session';
/**
 * SessionsController#login_preparations — shared by every successful login
 * (password, LINE, and the signup flows that log the new account straight in).
 *
 * Lives here rather than in a route file because four handlers call it.
 */
export async function loginPreparations(
  user: Pick<User, 'id' | 'accessLevel' | 'userType' | 'lastLogin'>,
  prevPage?: string,
) {
  if (!access(user.accessLevel, 'not_rejected')) {
    throw new AppError('このユーザーアカウントは現在ご利用いただけません。', {
      statusCode: 403,
      flashType: 'danger',
      redirect: '/',
    });
  }

  const rememberToken = newRememberToken();
  const daysElapsed = user.lastLogin
    ? Math.floor((Date.now() - user.lastLogin.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      loggedOut: false,
      lastLogin: new Date(),
      lastActivity: new Date(),
      daysElapsed,
      authToken: null,
      rememberToken,
      restorationToken: null,
    },
    include: { businessArea: true, castLevel: true, customerLevel: true, settings: true },
  });

  await setSession({ userId: user.id });
  await setRememberToken(rememberToken);

  // cast land on the order list, everyone else on home
  const redirect = prevPage || (updated.userType === 'cast' ? '/meetings' : '/home');

  return {
    ok: true,
    user: toCurrentUser(updated),
    requiredAction: requiredAction(updated),
    redirect,
    flash: { type: 'notice' as const, message: 'おかえりなさい' },
  };
}
