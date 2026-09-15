import { ageFromBirthday } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/access_requests */
export const GET = route(async (_request) => {
  const admin = await requireAdmin();
  const requests = await prisma.accessRequest.findMany({
    where: {
      user: {
        discardedAt: null,
        userType: 'cast',
        ...(admin.businessAreaId ? { businessAreaId: admin.businessAreaId } : {}),
      },
    },
    include: { user: { include: { castLevel: true, businessArea: true } } },
    orderBy: { id: 'desc' },
  });

  return {
    items: requests.map((accessRequest) => ({
      id: accessRequest.id,
      interview: accessRequest.interview,
      uploadedPicture: accessRequest.uploadedPicture,
      createdAt: accessRequest.createdAt.toISOString(),
      user: accessRequest.user
        ? {
            id: accessRequest.user.id,
            nickName: accessRequest.user.nickName,
            accessLevel: accessRequest.user.accessLevel,
            phone: accessRequest.user.phone,
            age: ageFromBirthday(accessRequest.user.birthday),
            businessAreaName: accessRequest.user.businessArea?.name ?? null,
            castLevelName: accessRequest.user.castLevel?.name ?? null,
          }
        : null,
    })),
  };
});
