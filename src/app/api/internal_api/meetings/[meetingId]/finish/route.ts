import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { completeMeeting, markMeetingFinished } from '@/server/services/meetings/lifecycle';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/finish */
export const POST = route<{ meetingId: string }>(async (request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({ end_time: z.string().optional(), finish_message: z.string().optional() })
    .parse(await jsonBody(request) ?? {});

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });
  if (!['in_progress', 'finished'].includes(meeting.status)) {
    throw new AppError('Meeting must have status in_progress or finished');
  }

  const attendances = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  const endTime =
    (body.end_time ? new Date(body.end_time) : null) ??
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

  await markMeetingFinished(meeting.id, {
    noMessages,
    finishMessage: body.finish_message || null,
    endTime,
  });

  await completeMeeting(meeting.id);
  return { ok: true };
});
