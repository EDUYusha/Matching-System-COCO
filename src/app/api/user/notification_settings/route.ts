import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: POST /user/notification_settings */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z
    .object({
      messageNotification: z.boolean().optional(),
      footprintNotification: z.boolean().optional(),
      noRanking: z.boolean().optional(),
      noFame: z.boolean().optional(),
    })
    .parse(await jsonBody(request));

  const settings =
    (await prisma.userSettings.findUnique({ where: { userId: user.id } })) ??
    (await prisma.userSettings.create({ data: { userId: user.id } }));

  const oldNoRanking = settings.noRanking;
  const newNoRanking = body.noRanking ?? settings.noRanking;

  let noRankingSetAt = settings.noRankingSetAt;
  if (oldNoRanking !== newNoRanking) {
    await prisma.userRankingVisibilityHistory.create({
      data: { userId: user.id, visible: !newNoRanking, changedAt: new Date() },
    });
    if (newNoRanking && settings.noRankingSetAt === null) noRankingSetAt = new Date();
  }

  await prisma.userSettings.update({
    where: { id: settings.id },
    data: {
      ...(body.messageNotification !== undefined ? { messageNotification: body.messageNotification } : {}),
      ...(body.footprintNotification !== undefined ? { footprintNotification: body.footprintNotification } : {}),
      noRanking: newNoRanking,
      ...(body.noFame !== undefined ? { noFame: body.noFame } : {}),
      noRankingSetAt,
    },
  });

  return { ok: true, redirect: '/user/settings', flash: { type: 'notice', message: '更新しました。' } };
});
