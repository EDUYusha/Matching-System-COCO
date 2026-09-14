import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { completeMeeting } from '@/server/services/meetings/lifecycle';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/recharge */
export const POST = route<{ meetingId: string }>(async (_request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });
  if (meeting.status !== 'post_charge_fail') {
    throw new AppError('Meeting must have status ›post_charge_fail‹');
  }

  await completeMeeting(meeting.id, { recharge: true });
  return { ok: true };
});
