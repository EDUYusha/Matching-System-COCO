import { prisma } from '@/server/lib/prisma';
import { startMeeting } from '@/server/services/meetings/lifecycle';
import { railsToInt, railsToTime, requestParams } from '@/server/http/params';
import { internalApiRoute, railsBadRequest, RailsRecordNotFound } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/start */
export const POST = internalApiRoute<{ meetingId: string }>(async (request, { params }) => {
  // `start_time` is a form field; blank, absent or unparseable all mean "fall back"
  const body = await requestParams(request);
  const givenStartTime = railsToTime(body.start_time);

  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();
  if (meeting.status !== 'scheduled') throw railsBadRequest('Meeting must have status scheduled');

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
    include: { user: { select: { serviceFeePermille: true } } },
  });

  // fall back to the latest recorded arrival, then to now
  const startTime =
    givenStartTime ??
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
});
