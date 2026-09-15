import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { urlsafeBase64 } from '@/server/lib/auth';
import { enqueueMail } from '@/server/jobs/queues';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** sessions: POST /restore_password */
export const POST = route(async (request) => {
  const body = z.object({ email: z.string() }).parse(await jsonBody(request));
  const user = await prisma.user.findFirst({ where: { email: body.email, discardedAt: null } });

  if (user) {
    const restorationToken = urlsafeBase64();
    await prisma.user.update({
      where: { id: user.id },
      data: { restorationToken, lastActivity: new Date(), loggedOut: true },
    });
    await enqueueMail('UsersMailer.password_restoration', { userId: user.id, restorationToken });
  }

  return {
    ok: true,
    redirect: '/',
    flash: { type: 'success', message: 'パスワード再設定用のメールを送信しました。' },
  };
});
