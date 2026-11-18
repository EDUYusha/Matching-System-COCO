import { prisma } from '@/server/lib/prisma';
import { completeMeeting } from '@/server/services/meetings/lifecycle';
import { railsToInt } from '@/server/http/params';
import { internalApiRoute, railsBadRequest, RailsRecordNotFound } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/recharge */
export const POST = internalApiRoute<{ meetingId: string }>(async (_request, { params }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();
  if (meeting.status !== 'post_charge_fail') {
    throw railsBadRequest('Meeting must have status ›post_charge_fail‹');
  }

  await completeMeeting(meeting.id, { recharge: true });
});
