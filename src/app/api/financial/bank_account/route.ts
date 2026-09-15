import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requirePermission } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/bank_account */
export const GET = route(async (_request) => {
  const user = await requirePermission('payout');
  const account = await prisma.castBankAccount.findUnique({ where: { userId: user.id } });
  return {
    bankAccount: account
      ? {
          bankName: account.bankName,
          bankNumber: account.bankNumber,
          branchName: account.branchName,
          branchNumber: account.branchNumber,
          accountType: account.accountType,
          accountNumber: account.accountNumber,
          holderName: account.holderName,
        }
      : null,
  };
});

/** financial: POST /financial/bank_account */
export const POST = route(async (request) => {
  const user = await requirePermission('payout');
  const body = z
    .object({
      bankName: z.string().min(1),
      bankNumber: z.string().min(1),
      branchName: z.string().min(1),
      branchNumber: z.string().min(1),
      accountType: z.string().min(1),
      accountNumber: z.string().min(1),
      holderName: z.string().min(1),
    })
    .parse(await jsonBody(request));

  await prisma.castBankAccount.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...body },
    update: body,
  });

  return { ok: true, redirect: '/user/settings', flash: { type: 'notice', message: '更新しました。' } };
});
