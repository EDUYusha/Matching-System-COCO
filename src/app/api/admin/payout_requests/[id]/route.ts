import { z } from 'zod';
import { dbDate } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { releasePayoutHold } from '@/server/services/payouts';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/payout_requests/:id */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      status: z.enum(['pending', 'on_hold', 'processed', 'cancelled']).optional(),
      handlingType: z.enum(['cash', 'bank_ng']).nullable().optional(),
      scheduledPayoutOn: z.string().optional(),
    })
    .parse(await jsonBody(request));

  // Transferring books a conversion and cancelling returns the credits, so both
  // go through /process and /cancel rather than a bare status change.
  if (body.status === 'processed' || body.status === 'cancelled') {
    throw new AppError('振込済み・取消は専用の操作から行ってください。');
  }

  // 保留解除 re-dates the transfer from today
  if (body.status === 'pending') await releasePayoutHold(params.id);

  await prisma.payoutRequest.update({
    where: { id: params.id },
    data: {
      ...(body.status === 'on_hold' ? { status: 'on_hold' } : {}),
      ...(body.handlingType !== undefined ? { handlingType: body.handlingType } : {}),
      ...(body.scheduledPayoutOn ? { scheduledPayoutOn: dbDate(body.scheduledPayoutOn) } : {}),
    },
  });
  return { ok: true };
});
