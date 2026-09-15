import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { newRememberToken, requiredAction } from '@/server/auth/session';
import { toCurrentUser } from '@/server/lib/serializers';
import { access } from '@/lib';
import { setRememberToken, setSession } from '@/server/auth/session';
/**
 * Shared by the sessions route handlers: the schemas and query helpers
 * the original sessions.ts declared once and used from several actions.
 */

/**
 * Port of SessionsController: login, logout, the LINE login round-trip and
 * password restoration.
 */

export const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
  /** client-side path to return to, replacing flash[:prev_page] */
  prevPage: z.string().optional(),
});

/**
 * SessionsController#login_preparations — shared by every successful login.
 * Sets the session and remember-me cookies, refreshes the login timestamps and
 * reports where the client should land.
 */
export async function loginPreparations(
  user: { id: number; accessLevel: string; userType: string; lastLogin: Date | null },
  prevPage?: string,
) {
  if (!access(user.accessLevel as never, 'not_rejected')) {
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
