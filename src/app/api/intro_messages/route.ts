import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { stripTags } from '@/server/lib/sanitize';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /intro_messages */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const introMessage = await prisma.introMessage.findUnique({ where: { userId: user.id } });
  return { template: introMessage?.template ?? '' };
});

/** misc: PUT /intro_messages */
export const PUT = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ template: z.string() }).parse(await jsonBody(request));
  const template = stripTags(body.template);

  if (!template.trim()) {
    // an empty template removes the row, as the original did
    await prisma.introMessage.deleteMany({ where: { userId: user.id } });
  } else {
    await prisma.introMessage.upsert({
      where: { userId: user.id },
      create: { userId: user.id, template },
      update: { template },
    });
  }

  return { ok: true, redirect: '/user/settings', flash: { type: 'notice', message: '定型文を更新しました。' } };
});
