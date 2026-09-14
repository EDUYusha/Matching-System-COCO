import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/credit_transactions */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({
      category: z.string().optional(),
      userId: z.coerce.number().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.CreditTransactionWhereInput = {
    ...(query.category ? { category: query.category as never } : {}),
    ...(query.userId
      ? { OR: [{ chargedUserId: query.userId }, { creditedUserId: query.userId }] }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [transactions, totalCount, sums] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      include: {
        chargedUser: { select: { id: true, nickName: true } },
        creditedUser: { select: { id: true, nickName: true } },
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.aggregate({ where, _sum: { chargedAmount: true, creditedAmount: true } }),
  ]);

  return {
    ...paginate(transactions, totalCount, page, 50),
    totals: {
      chargedAmount: sums._sum.chargedAmount ?? 0,
      creditedAmount: sums._sum.creditedAmount ?? 0,
    },
  };
});
