import { prisma } from '@/server/lib/prisma';
import { toUserCard } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: GET /home */
export const GET = route(async (_request) => {
  await requireUser();

  const availableCast = await prisma.user.findMany({
    where: { userType: 'cast', availableUntil: { gt: new Date() }, publicProfile: true, discardedAt: null },
    include: { castLevel: true, customerLevel: true },
  });
  const attributes = await prisma.attribute.findMany({
    where: { userId: { in: availableCast.map((cast) => cast.id) } },
    select: { userId: true, name: true, value: true },
  });
  const banners = await prisma.banner.findMany({ where: { position: { not: null } } });

  const attributesByUser = new Map<number, Array<{ name: string; value: string | null }>>();
  for (const attribute of attributes) {
    const list = attributesByUser.get(attribute.userId) ?? [];
    list.push({ name: attribute.name, value: attribute.value });
    attributesByUser.set(attribute.userId, list);
  }

  return {
    availableCast: availableCast.map((cast) =>
      toUserCard(cast, { attributes: attributesByUser.get(cast.id) ?? [] }),
    ),
    banners: banners.map((banner) => ({
      id: banner.id,
      name: banner.name,
      position: banner.position,
      bannerPictureUrl: banner.bannerPictureUrl,
      mainPictureUrl: banner.mainPictureUrl,
    })),
  };
});
