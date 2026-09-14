import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: POST /profile/meeting_preferences */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ preferenceIds: z.array(z.coerce.number()) }).parse(await jsonBody(request));

  const existing = await prisma.meetingPreference.findMany({
    where: { userId: user.id },
    select: { parentId: true },
  });
  const oldIds = existing.map((preference) => preference.parentId).filter((id): id is number => id !== null);
  const newIds = body.preferenceIds;

  const toRemove = oldIds.filter((id) => !newIds.includes(id));
  const toAdd = newIds.filter((id) => !oldIds.includes(id));

  const schema = await prisma.meetingPreferencesSchema.findMany({ where: { id: { in: toAdd } } });
  if (schema.length !== toAdd.length) {
    throw new AppError('Invalid preference id!', { redirect: '/profile/settings' });
  }
  if (user.userType !== 'cast') {
    throw new AppError('キャストのみ設定できます', { redirect: '/profile/settings' });
  }

  await prisma.$transaction(async (t) => {
    if (toRemove.length) {
      await t.meetingPreference.deleteMany({ where: { userId: user.id, parentId: { in: toRemove } } });
    }
    for (const parentId of toAdd) {
      const preference = schema.find((row) => row.id === parentId)!;
      if (!preference.castPreference) {
        throw new AppError('Invalid preference id!', { redirect: '/profile/settings' });
      }
      // MeetingPreference#mutually_exclusive_preferences_may_not_exist
      if (preference.mutuallyExclusive) {
        const conflicting = await t.meetingPreference.findFirst({
          where: {
            userId: user.id,
            parent: {
              category: preference.category,
              subcategory: preference.subcategory,
              name: { not: preference.name },
            },
          },
        });
        if (conflicting) {
          throw new AppError('Invalid preference id!', { redirect: '/profile/settings' });
        }
      }
      await t.meetingPreference.create({ data: { userId: user.id, parentId } });
    }
  });

  return { ok: true, redirect: '/profile/settings', flash: { type: 'notice', message: '更新しました。' } };
});
