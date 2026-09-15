import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { promoteUpload, storeUpload } from '@/server/lib/uploads';
import { pictureUrl, setProfilePicture } from '@/server/services/users';
import { requireUser } from '@/server/auth/session';
import { uploadParts } from '@/server/http/multipart';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** PicturesController#create — a profile gallery upload. */
export const POST = route(async (request) => {
  const user = await requireUser();
  const [file] = await uploadParts(request);
  if (!file) throw new AppError('ファイルを選択してください');

  const cached = await storeUpload(file.file, { filename: file.filename, mimeType: file.mimetype });
  const stored = await promoteUpload(cached);

  const existingCount = await prisma.picture.count({ where: { userId: user.id, public: true } });
  const picture = await prisma.picture.create({
    data: {
      userId: user.id,
      public: true,
      // the first public picture becomes the profile picture
      profilePic: existingCount === 0,
      fileData: stored as unknown as Prisma.InputJsonValue,
    },
  });

  if (picture.profilePic) await setProfilePicture(picture.id);

  return {
    ok: true,
    redirect: '/profile/edit_basics',
    picture: {
      id: picture.id,
      url: pictureUrl(picture) ?? '/system/noimage.png',
      profilePic: picture.profilePic,
      public: picture.public,
    },
  };
});
