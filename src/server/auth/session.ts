import { cookies, headers } from 'next/headers';
import type { User } from '@prisma/client';
import { access, can, type AccessGate, type Permission } from '@/lib';
import { env } from '@/server/config/env';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError, UnauthorizedError } from '@/server/lib/errors';
import {
  ADMIN_SESSION_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  signAdminSession,
  signSession,
  urlsafeBase64,
  verifyAdminSession,
  verifyApiToken,
  verifySession,
  type SessionPayload,
} from '@/server/lib/auth';
import { markActivity } from '@/server/services/users';

/**
 * Port of ApplicationController's authentication chain, as Next server helpers.
 *
 * Rails resolved the user from an encrypted session cookie, falling back to a
 * permanent signed remember-me cookie, falling back to a JWT Bearer token. All
 * three still work. What changed is the shape of a failure: a route handler
 * throws and the error envelope carries a `redirect` the client follows, while a
 * Server Component calls `redirect()` itself.
 *
 * These read `cookies()` and `headers()`, so they only run on the server and
 * only inside a request scope.
 */

const THIRTY_DAYS = 30 * 24 * 60 * 60;

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  maxAge: THIRTY_DAYS,
} as const;

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function setSession(payload: SessionPayload): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSession(payload), cookieOptions);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: SESSION_COOKIE, path: '/' });
  jar.delete({ name: REMEMBER_COOKIE, path: '/' });
}

export async function setRememberToken(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(REMEMBER_COOKIE, token, cookieOptions);
}

/** A fresh remember-me token, as login_preparations generated on every login. */
export function newRememberToken(): string {
  return urlsafeBase64();
}

/**
 * ApplicationController#set_current_user.
 *
 * Cached per request so a layout, a page and a route handler in the same render
 * do not each hit the database.
 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);

  let user: User | null = null;

  if (session?.userId) {
    user = await prisma.user.findFirst({ where: { id: session.userId, discardedAt: null } });
  } else if (jar.get(REMEMBER_COOKIE)?.value) {
    // cookie_authenticate's remember-me branch
    user = await prisma.user.findFirst({
      where: {
        rememberToken: jar.get(REMEMBER_COOKIE)?.value,
        loggedOut: false,
        discardedAt: null,
      },
    });
    if (user) {
      const daysElapsed = user.lastLogin
        ? Math.floor((Date.now() - user.lastLogin.getTime()) / (24 * 60 * 60 * 1000))
        : 0;
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date(), lastActivity: new Date(), daysElapsed, authToken: null },
      });
    }
  } else {
    // token_authenticate — the mobile wrapper's Bearer token
    const header = (await headers()).get('authorization');
    if (header) {
      const token = header.split(' ').pop() ?? '';
      const userId = verifyApiToken(token);
      if (userId) {
        user = await prisma.user.findFirst({ where: { id: userId, authToken: token, discardedAt: null } });
      }
    }
  }

  // forcefully logged out elsewhere (an admin action) while no live session exists
  if (user?.loggedOut && !session?.userId) user = null;

  if (user) void markActivity(user.id);
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError('ログインして下さい');
  return user;
}

/** must_be_customer / must_be_cast / must_can_payout */
export async function requirePermission(permission: Permission): Promise<User> {
  const user = await requireUser();
  if (!can(user.userType, permission)) throw new ForbiddenError('その操作はできません。', '/home');
  return user;
}

/** must_have_full_access_level and the other access? gates */
export async function requireGate(gate: AccessGate, redirect?: string): Promise<User> {
  const user = await requireUser();
  if (!access(user.accessLevel, gate)) {
    throw new ForbiddenError('権利がありません', redirect ?? '/cast/restricted?level=full');
  }
  return user;
}

/**
 * ApplicationController#check_phone_number_presence and #check_customers_selected,
 * reported to the client rather than redirected server-side.
 */
export function requiredAction(user: User): { action: string; path: string; message?: string } | null {
  if (
    (env.isProduction || env.isStaging) &&
    (user.userType === 'customer' || user.userType === 'inviter') &&
    !user.phone?.trim()
  ) {
    return {
      action: 'verify_phone',
      path: '/user/phone_number',
      message:
        'セキュリティ強化の為、電話番号でのSMS認証は必須になりました。<br>お手数おかけいたしますがご協力お願いいたします。',
    };
  }

  if (user.userType === 'cast' && user.accessLevel === 'full' && !user.customersSelected) {
    return { action: 'select_customers', path: '/cast/customer_recommendations' };
  }

  return null;
}

// --- admin panel session (separate cookie, separate secret, `admins` table) ---

export async function currentAdmin() {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;
  return prisma.admin.findUnique({ where: { id: session.adminId } });
}

export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin) throw new UnauthorizedError('ログインして下さい');
  return admin;
}

export async function setAdminSession(adminId: number): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, signAdminSession({ adminId }), {
    ...cookieOptions,
    maxAge: 12 * 60 * 60,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: ADMIN_SESSION_COOKIE, path: '/' });
}
