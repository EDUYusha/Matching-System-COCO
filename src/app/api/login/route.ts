import { prisma } from '@/server/lib/prisma';
import { UnauthorizedError } from '@/server/lib/errors';
import { verifyPassword } from '@/server/lib/auth';
import { clientIp, jsonBody, route } from '@/server/http/route';
import { enforceRateLimit, RATE_LIMITS } from '@/server/lib/rate-limit';
import { loginPreparations, loginSchema } from '@/server/api/sessions-shared';
export const dynamic = 'force-dynamic';

/** sessions: POST /login */
export const POST = route(async (request) => {
  const body = loginSchema.parse(await jsonBody(request));
  await enforceRateLimit('login-ip', clientIp(request), RATE_LIMITS.loginPerIp);
  await enforceRateLimit('login', body.email.toLowerCase(), RATE_LIMITS.loginPerAccount);
  const user = await prisma.user.findFirst({ where: { email: body.email, discardedAt: null } });
  const valid = user && (await verifyPassword(body.password, user.passwordDigest));

  if (!valid || !user) {
    throw new UnauthorizedError('ログイン情報に間違いがあります。');
  }

  return loginPreparations(user, body.prevPage);
});
