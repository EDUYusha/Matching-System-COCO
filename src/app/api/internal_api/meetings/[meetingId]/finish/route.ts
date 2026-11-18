import { prisma } from '@/server/lib/prisma';
import { completeMeeting, markMeetingFinished } from '@/server/services/meetings/lifecycle';
import { railsPresence, railsToInt, railsToTime, requestParams } from '@/server/http/params';
import { internalApiRoute, railsBadRequest, RailsRecordNotFound } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/finish */
export const POST = internalApiRoute<{ meetingId: string }>(async (request, { params }) => {
  // the panel passes both of these in the query string, either of them empty
  const body = await requestParams(request);
  const givenEndTime = railsToTime(body.end_time);
  const finishMessage = railsPresence(body.finish_message);

  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();
  if (!['in_progress', 'finished'].includes(meeting.status)) {
    throw railsBadRequest('Meeting must have status in_progress or finished');
  }

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  const endTime =
    givenEndTime ??
    attendances
      .map((attendance) => attendance.endTime)
      .filter((time): time is Date => !!time)
      .sort((a, b) => b.getTime() - a.getTime())[0] ??
    new Date();

  await prisma.castAttendance.updateMany({
    where: { meetingId: meeting.id, role: { not: 'out' }, endTime: null, startTime: { not: null } },
    data: { endTime },
  });

  // a re-finish must not send the wrap-up messages twice
  const noMessages = meeting.status === 'finished';

  await markMeetingFinished(meeting.id, { noMessages, finishMessage, endTime });

  await completeMeeting(meeting.id);
});
