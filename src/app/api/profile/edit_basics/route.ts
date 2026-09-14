import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: GET /profile/edit_basics */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const pictures = await prisma.picture.findMany({
    where: { userId: user.id, public: true },
    orderBy: { profilePic: 'desc' },
  });
  const { pictureUrl } = await import('@/server/services/users');
  return {
    pictures: pictures.map((picture) => ({
      id: picture.id,
      url: pictureUrl(picture) ?? '/system/noimage.png',
      profilePic: picture.profilePic,
      public: picture.public,
    })),
  };
});
