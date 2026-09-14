import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/payout_requests */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({
      status: z.string().optional(),
      scheduledOn: z.string().optional(),
      handlingType: z.string().optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.PayoutRequestWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.handlingType ? { handlingType: query.handlingType } : {}),
    ...(query.scheduledOn ? { scheduledPayoutOn: new Date(`${query.scheduledOn}T00:00:00+09:00`) } : {}),
  };

  const [requests, totalCount] = await Promise.all([
    prisma.payoutRequest.findMany({
      where,
      include: {
        user: { select: { id: true, nickName: true, realName: true, castBankAccount: true } },
        creditConversion: true,
      },
      orderBy: { id: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.payoutRequest.count({ where }),
  ]);

  return paginate(requests, totalCount, page, 50);
});
