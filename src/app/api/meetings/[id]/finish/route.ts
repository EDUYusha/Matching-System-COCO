import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import {
  castFinishMeeting,
  completeMeeting,
  markMeetingFinished
} from '@/server/services/meetings/lifecycle';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/finish */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ skipComplete: z.boolean().optional() }).parse(await jsonBody(request) ?? {});

  const attendance = await prisma.castAttendance.findFirst({
    where: { meetingId: params.id, userId: user.id },
  });
  if (!attendance) throw new AppError('参加記録が見つかりません', { statusCode: 400 });

  await castFinishMeeting(attendance.id);

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  const attendingCasts = await prisma.castAttendance.findMany({
    where: { meetingId: meeting.id, role: 'attending' },
  });
  const allFinished = attendingCasts.every((candidate) => candidate.endTime !== null);

  logger.info(
    {
      meetingId: meeting.id,
      attending: attendingCasts.length,
      finished: attendingCasts.filter((c) => c.endTime !== null).length,
      allFinished,
      status: meeting.status,
    },
    'MeetingsController#finish: cast finish check',
  );

  if (allFinished) {
    await markMeetingFinished(meeting.id);
    if (body.skipComplete) {
      logger.info({ meetingId: meeting.id }, 'finish: skipping settlement (times to be corrected)');
    } else {
      try {
        await completeMeeting(meeting.id);
      } catch (error) {
        logger.error({ error, meetingId: meeting.id }, 'finish: settlement failed');
      }
    }
  }

  return { ok: true, redirect: `/conversations/${meeting.conversationId ?? ''}` };
});
