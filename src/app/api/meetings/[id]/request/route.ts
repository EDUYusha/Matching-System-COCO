import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { toCastAttendanceDto, toMeetingSummary, type MeetingRow } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { MEETING_INCLUDE } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id/request */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: MEETING_INCLUDE,
  });

  const isParticipant =
    meeting.ownerId === user.id ||
    meeting.castAttendances.some((attendance) => attendance.userId === user.id);
  if (!isParticipant) throw new ForbiddenError('権利がありません。', '/conversations');
  if (!['cast_requested', 'requested'].includes(meeting.status)) {
    throw new AppError('その操作はできません。', { redirect: '/conversations' });
  }

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id },
    include: { user: { include: { castLevel: true, customerLevel: true } } },
  });

  return {
    meeting: toMeetingSummary(meeting as unknown as MeetingRow),
    cast: attendances.map((attendance) => toCastAttendanceDto(attendance)),
    isOwner: meeting.ownerId === user.id,
  };
});
