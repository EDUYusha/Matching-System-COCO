import { prisma } from '@/server/lib/prisma';
import { currentAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/me */
export const GET = route(async () => {
  const admin = await currentAdmin();
  if (!admin) return { admin: null };

  const businessArea = admin.businessAreaId
    ? await prisma.businessArea.findUnique({ where: { id: admin.businessAreaId } })
    : null;

  return { admin: { ...admin, businessAreaName: businessArea?.name ?? null } };
});
