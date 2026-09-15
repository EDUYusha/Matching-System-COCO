import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { destroyUpload, parseShrineData } from '@/server/lib/uploads';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: DELETE /pictures/:id */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const picture = await prisma.picture.findFirst({ where: { id: params.id, public: true } });
  if (!picture) throw new AppError('写真が見つかりません', { statusCode: 404 });
  if (picture.userId !== user.id) {
    throw new ForbiddenError('他の人の写真は消せませんよ', '/profile/edit_basics');
  }

  await prisma.picture.delete({ where: { id: picture.id } });
  await destroyUpload(parseShrineData(picture.fileData));

  return { ok: true, redirect: '/profile/edit_basics' };
});
