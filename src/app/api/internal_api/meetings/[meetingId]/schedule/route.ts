import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { autoOpenMeeting } from '@/server/services/meetings/selection';
import { acceptIndividualMeeting } from '@/server/services/meetings/lifecycle';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/schedule */
export const POST = route<{ meetingId: string }>(async (_request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });

  if (!['requested', 'cast_requested', 'cast_selectable'].includes(meeting.status)) {
    throw new AppError('Meeting must have status requested or cast_selectable');
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

  return { ok: true };
});
