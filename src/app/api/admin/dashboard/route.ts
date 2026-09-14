import { prisma } from '@/server/lib/prisma';
import { currentCompanyBalance } from '@/server/services/credits';
import { branchScope, requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/dashboard */
export const GET = route(async (_request) => {
  const admin = await requireAdmin();
  const scope = branchScope(admin);

  const [castCount, customerCount, openMeetings, pendingPayouts, unreadInquiries, balance] = await Promise.all([
    prisma.user.count({ where: { userType: 'cast', discardedAt: null, ...scope } }),
    prisma.user.count({ where: { userType: { in: ['customer', 'inviter'] }, discardedAt: null } }),
    prisma.meeting.count({
      where: {
        status: { in: ['requested', 'cast_selectable', 'cast_requested', 'scheduled', 'in_progress'] },
        ...(admin.businessAreaId ? { area: { businessAreaId: admin.businessAreaId } } : {}),
      },
    }),
    prisma.payoutRequest.count({ where: { status: { in: ['pending', 'on_hold'] } } }),
    prisma.unreadMessage.count({
      where: { ignored: false, conversation: { category: { in: ['admin', 'operator'] } } },
    }),
    currentCompanyBalance(),
  ]);

  const accessLevelCounts = await prisma.user.groupBy({
    by: ['accessLevel'],
    where: { userType: 'cast', discardedAt: null, ...scope },
    _count: { _all: true },
  });

  return {
    castCount,
    customerCount,
    openMeetings,
    pendingPayouts,
    unreadInquiries,
    companyBalance: balance,
    castByAccessLevel: accessLevelCounts.map((row) => ({
      accessLevel: row.accessLevel,
      count: row._count._all,
    })),
  };
});
