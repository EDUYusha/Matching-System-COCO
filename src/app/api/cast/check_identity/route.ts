import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/server/config/env';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { storeUpload } from '@/server/lib/uploads';
import { requireUser } from '@/server/auth/session';
import { uploadParts } from '@/server/http/multipart';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/**
 * CastController#check_identity — stores the identity document privately and
 * moves the cast from unauthorized to picture_uploaded.
 *
 * The file lands in castPicturesDir, which is outside the public uploads mount:
 * only the admin panel can read it back, through its own authenticated route.
 */
export const POST = route(async (request) => {
  const user = await requireUser();

  const [file] = await uploadParts(request);
  if (!file) throw new AppError('Invalid File');
  if (!/\.(jpe?g|gif|png|webp)$/i.test(file.filename)) throw new AppError('Invalid File');

  await mkdir(env.castPicturesDir, { recursive: true });
  const extension = file.filename.slice(file.filename.lastIndexOf('.'));
  const newFileName = `${user.id}${extension}`;

  const staged = await storeUpload(file.file, {
    filename: file.filename,
    mimeType: file.mimetype,
    storage: 'cache',
    validateImage: false,
  });
  await copyFile(join(env.uploadsDir, 'cache', staged.id), join(env.castPicturesDir, newFileName));
  await rm(join(env.uploadsDir, 'cache', staged.id), { force: true });

  await prisma.accessRequest.upsert({
    where: { userId: user.id },
    create: { userId: user.id, uploadedPicture: newFileName, interview: true },
    update: { uploadedPicture: newFileName, interview: true },
  });

  if (user.accessLevel === 'unauthorized') {
    await prisma.user.update({ where: { id: user.id }, data: { accessLevel: 'picture_uploaded' } });
  }

  return {
    ok: true,
    redirect: '/conversations',
    flash: {
      type: 'notice',
      message: 'ファイルアップロードありがとうございます。管理者が確認するまでお待ちください。',
    },
  };
});
