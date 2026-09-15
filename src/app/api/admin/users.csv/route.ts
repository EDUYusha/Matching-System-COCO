import { z } from 'zod';
import { isoDate } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { csvResponse } from '@/server/api/csv';
import { query, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/users.csv — the member export. */
export const GET = route(async (_request, { searchParams }) => {
  const admin = await requireAdmin();
  const params = query(searchParams, z.object({ userType: z.string().optional() }));

  const users = await prisma.user.findMany({
    where: {
      discardedAt: null,
      ...(params.userType ? { userType: params.userType as never } : {}),
      ...(admin.businessAreaId ? { businessAreaId: admin.businessAreaId } : {}),
    },
    include: { castLevel: true, customerLevel: true, businessArea: true },
    orderBy: { id: 'asc' },
  });

  const header = [
    'id', 'user_type', 'nick_name', 'real_name', 'email', 'phone', 'access_level',
    'business_area', 'level', 'credit_balance', 'service_fee_permille',
    'order_fee_per_time', 'join_date', 'last_login',
  ];
  const rows = users.map((user) => [
    user.id,
    user.userType,
    user.nickName,
    user.realName ?? '',
    user.email ?? '',
    user.phone ?? '',
    user.accessLevel,
    user.businessArea?.name ?? '',
    user.castLevel?.name ?? user.customerLevel?.name ?? '',
    user.creditBalance,
    user.serviceFeePermille ?? '',
    user.orderFeePerTime ?? '',
    isoDate(user.joinDate),
    user.lastLogin ? user.lastLogin.toISOString() : '',
  ]);

  return csvResponse([header, ...rows], `users-${isoDate(new Date())}.csv`);
});
