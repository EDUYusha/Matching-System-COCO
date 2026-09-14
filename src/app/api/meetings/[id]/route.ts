import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { toCastAttendanceDto, toMeetingSummary, type MeetingRow } from '@/server/lib/serializers';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { MEETING_INCLUDE } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('order');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: MEETING_INCLUDE,
  });
  if (meeting.ownerId !== user.id) throw new ForbiddenError('権利がありません', '/home');
  if (meeting.status !== 'cast_selectable') {
    throw new AppError('Cast selection time is already over.', { redirect: '/home' });
  }

  // cast_attendances_with_counts: how often each candidate already met this guest
  const counts = await prisma.$queryRaw<Array<{ id: number; times_met: bigint }>>(Prisma.sql`
    SELECT cas.id,
           (SELECT COUNT(*) FROM cast_attendances inner_cas
            JOIN meetings m ON m.id = inner_cas.meeting_id
            WHERE inner_cas.role = 'attending'
              AND m.owner_id = ${meeting.ownerId}
              AND m.status = 'completed'
              AND inner_cas.user_id = cas.user_id) AS times_met
    FROM cast_attendances cas
    WHERE cas.meeting_id = ${meeting.id}
  `);

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id },
    include: { user: { include: { castLevel: true, customerLevel: true } } },
    orderBy: { id: 'desc' },
  });
  const attributes = await prisma.attribute.findMany({
    where: { userId: { in: attendances.map((attendance) => attendance.userId) } },
    select: { userId: true, name: true, value: true },
  });

  return {
    meeting: toMeetingSummary(meeting as unknown as MeetingRow),
    cast: attendances.map((attendance) =>
      toCastAttendanceDto(attendance, {
        timesMet: Number(counts.find((row) => row.id === attendance.id)?.times_met ?? 0),
        attributes: attributes.filter((attribute) => attribute.userId === attendance.userId),
      }),
    ),
  };
});
