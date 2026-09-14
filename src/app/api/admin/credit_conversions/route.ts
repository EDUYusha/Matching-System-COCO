import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/credit_conversions */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({
      flowDirection: z.string().optional(),
      checked: z.string().optional(),
      userId: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.CreditConversionWhereInput = {
    ...(query.flowDirection ? { flowDirection: query.flowDirection as never } : {}),
    ...(query.checked !== undefined ? { checked: query.checked === '1' } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
  };

  const [conversions, totalCount] = await Promise.all([
    prisma.creditConversion.findMany({
      where,
      include: {
        user: { select: { id: true, nickName: true, userType: true, castBankAccount: true } },
        creditTransaction: true,
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.creditConversion.count({ where }),
  ]);

  return paginate(conversions, totalCount, page, 50);
});
