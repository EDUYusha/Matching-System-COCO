import { prisma } from '@/server/lib/prisma';
import { UnauthorizedError } from '@/server/lib/errors';
import { verifyPassword } from '@/server/lib/auth';
import { jsonBody, route } from '@/server/http/route';
import { loginPreparations, loginSchema } from '@/server/api/sessions-shared';
export const dynamic = 'force-dynamic';

/** sessions: POST /login */
export const POST = route(async (request) => {
  const body = loginSchema.parse(await jsonBody(request));
  const user = await prisma.user.findFirst({ where: { email: body.email, discardedAt: null } });
  const valid = user && (await verifyPassword(body.password, user.passwordDigest));

  if (!valid || !user) {
    throw new UnauthorizedError('ログイン情報に間違いがあります。');
  }

  return loginPreparations(user, body.prevPage);
});
