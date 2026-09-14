import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { toCastAttendanceDto, toMeetingSummary, type MeetingRow } from '@/server/lib/serializers';
import { attendanceEarnings, calculateMeetingCosts } from '@/server/services/meetings/costs';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { MEETING_INCLUDE } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id/costs */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('financial_history');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: MEETING_INCLUDE,
  });
  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
    include: { user: { include: { castLevel: true } }, creditTransaction: true },
  });

  const isParticipant =
    meeting.ownerId === user.id || attendances.some((attendance) => attendance.userId === user.id);
  if (!isParticipant) throw new ForbiddenError('禁止だ', '/financial/history');

  const costs = await calculateMeetingCosts(meeting.id);

  return {
    meeting: toMeetingSummary(meeting as unknown as MeetingRow),
    attendances: attendances.map((attendance) =>
      toCastAttendanceDto(attendance, {
        costs: costs.get(attendance.id).toJSON(),
        earnings: attendanceEarnings(meeting, attendance, costs.get(attendance.id)),
      }),
    ),
    total: costs.total,
    isOwner: meeting.ownerId === user.id,
  };
});
