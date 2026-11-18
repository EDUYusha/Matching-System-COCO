import { prisma } from '@/server/lib/prisma';
import { autoOpenMeeting } from '@/server/services/meetings/selection';
import { acceptIndividualMeeting } from '@/server/services/meetings/lifecycle';
import { railsToInt } from '@/server/http/params';
import { internalApiRoute, railsBadRequest, RailsRecordNotFound } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/schedule */
export const POST = internalApiRoute<{ meetingId: string }>(async (_request, { params }) => {
  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();

  if (!['requested', 'cast_requested', 'cast_selectable'].includes(meeting.status)) {
    throw railsBadRequest('Meeting must have status requested or cast_selectable');
  }

  if (meeting.category === 'individual') {
    // whichever side has not answered yet is the one accepting
    const acceptingUserId =
      meeting.status === 'cast_requested'
        ? meeting.ownerId
        : (
            await prisma.castAttendance.findFirstOrThrow({
              where: { meetingId: meeting.id },
              orderBy: { id: 'asc' },
            })
          ).userId;
    await acceptIndividualMeeting(meeting.id, acceptingUserId);
  } else {
    await autoOpenMeeting(meeting.id);
  }
});
