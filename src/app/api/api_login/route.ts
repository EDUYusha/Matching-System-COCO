import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { signApiToken, verifyPassword } from '@/server/lib/auth';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: POST /api_login */
export const POST = route(async (request) => {
  const body = z.object({ email: z.string(), password: z.string() }).parse(await jsonBody(request));
  const user = await prisma.user.findFirst({ where: { email: body.email, discardedAt: null } });
  const valid = user && (await verifyPassword(body.password, user.passwordDigest));

  if (!valid || !user) {
    return NextResponse.json({ error: 'invalid username/password' }, { status: 401 });
  }

  const token = signApiToken(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { authToken: token } });
  return { auth_token: token };
});
