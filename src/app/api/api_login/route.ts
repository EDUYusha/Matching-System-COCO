import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { signApiToken, verifyPassword } from '@/server/lib/auth';
import { clientIp, jsonBody, route } from '@/server/http/route';
import { enforceRateLimit, RATE_LIMITS } from '@/server/lib/rate-limit';
export const dynamic = 'force-dynamic';

/** sessions: POST /api_login */
export const POST = route(async (request) => {
  const body = z.object({ email: z.string(), password: z.string() }).parse(await jsonBody(request));
  await enforceRateLimit('login-ip', clientIp(request), RATE_LIMITS.loginPerIp);
  await enforceRateLimit('login', body.email.toLowerCase(), RATE_LIMITS.loginPerAccount);
  const user = await prisma.user.findFirst({ where: { email: body.email, discardedAt: null } });
  const valid = user && (await verifyPassword(body.password, user.passwordDigest));

  if (!valid || !user) {
    return NextResponse.json({ error: 'invalid username/password' }, { status: 401 });
  }

  const token = signApiToken(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { authToken: token } });
  return { auth_token: token };
});
