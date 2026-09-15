import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { completeMeeting } from '@/server/services/meetings/lifecycle';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/meetings/:id/recharge */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  // completeMeeting books the order's ledger rows and charges the card, so on an
  // order that is already settled it would bill the guest a second time
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (meeting.status !== 'post_charge_fail') {
    throw new AppError('再決済できるのは残高不足のオーダーのみです。');
  }

  await completeMeeting(meeting.id, { recharge: true });
  return { ok: true };
});
