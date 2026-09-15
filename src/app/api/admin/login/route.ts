import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { UnauthorizedError } from '@/server/lib/errors';
import { verifyPassword } from '@/server/lib/auth';
import { setAdminSession } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/login */
export const POST = route(async (request) => {
  const body = z.object({ loginName: z.string(), password: z.string() }).parse(await jsonBody(request));
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
