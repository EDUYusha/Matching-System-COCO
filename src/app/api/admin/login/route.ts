import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { UnauthorizedError } from '@/server/lib/errors';
import { verifyPassword } from '@/server/lib/auth';
import { setAdminSession } from '@/server/auth/session';
import { clientIp, jsonBody, route } from '@/server/http/route';
import { enforceRateLimit, RATE_LIMITS } from '@/server/lib/rate-limit';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/login */
export const POST = route(async (request) => {
  const body = z.object({ loginName: z.string(), password: z.string() }).parse(await jsonBody(request));
  await enforceRateLimit('admin-login-ip', clientIp(request), RATE_LIMITS.loginPerIp);
  await enforceRateLimit('admin-login', body.loginName.toLowerCase(), RATE_LIMITS.loginPerAccount);
  const admin = await prisma.admin.findUnique({ where: { loginName: body.loginName } });

  if (!admin || !(await verifyPassword(body.password, admin.passwordDigest))) {
    throw new UnauthorizedError('ログイン情報に間違いがあります。');
  }

  await setAdminSession(admin.id);

  return {
    ok: true,
    admin: { id: admin.id, loginName: admin.loginName, businessAreaId: admin.businessAreaId },
  };
});
