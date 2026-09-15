import { cookies } from 'next/headers';
import { prisma } from '@/server/lib/prisma';
import { UnauthorizedError } from '@/server/lib/errors';
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '@/server/lib/auth';
/**
 * The admin panel's own session, kept separate from the member session exactly
 * as the CakePHP app was: its own cookie, its own secret, its own `admins`
 * table. An operator signing into the panel never becomes a `users` row, and a
 * signed-in member never gains admin access.
 */

export interface AdminIdentity {
  id: number;
  loginName: string;
  businessAreaId: number | null;
}

export async function currentAdmin(): Promise<AdminIdentity | null> {
  const jar = await cookies();
  const session = verifyAdminSession(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;

  return prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { id: true, loginName: true, businessAreaId: true },
  });
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin();
  if (!admin) throw new UnauthorizedError('管理画面にログインしてください');
  return admin;
}

/** Restricts a query to the admin's branch when they are branch-scoped. */
export function branchScope(admin: { businessAreaId: number | null }): { businessAreaId?: number } {
  return admin.businessAreaId ? { businessAreaId: admin.businessAreaId } : {};
}
