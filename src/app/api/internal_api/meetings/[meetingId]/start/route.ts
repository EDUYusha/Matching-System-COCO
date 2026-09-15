import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { startMeeting } from '@/server/services/meetings/lifecycle';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/start */
export const POST = route<{ meetingId: string }>(async (request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const body = z.object({ start_time: z.string().optional() }).parse(await jsonBody(request) ?? {});

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });
  if (meeting.status !== 'scheduled') throw new AppError('Meeting must have status scheduled');

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
    include: { user: { select: { serviceFeePermille: true } } },
  });

  // fall back to the latest recorded arrival, then to now
  const startTime =
    (body.start_time ? new Date(body.start_time) : null) ??
    attendances
      .map((attendance) => attendance.startTime)
      .filter((time): time is Date => !!time)
      .sort((a, b) => b.getTime() - a.getTime())[0] ??
    new Date();

  for (const attendance of attendances) {
    if (attendance.serviceFeePermille === null) {
      await prisma.castAttendance.update({
        where: { id: attendance.id },
        data: { serviceFeePermille: attendance.user.serviceFeePermille },
      });
    }
  }
  await prisma.castAttendance.updateMany({
    where: { meetingId: meeting.id, role: { not: 'out' }, startTime: null },
    data: { startTime },
  });

  await startMeeting(meeting.id);
  return { ok: true };
});
