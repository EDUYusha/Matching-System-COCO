import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { currentCompanyBalance } from '@/server/services/credits';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/company_balances */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z.object({ page: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const [balances, totalCount] = await Promise.all([
    prisma.companyBalance.findMany({
      include: { creditConversion: { include: { user: { select: { id: true, nickName: true } } } } },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.companyBalance.count(),
  ]);

  return { ...paginate(balances, totalCount, page, 50), current: await currentCompanyBalance() };
});
