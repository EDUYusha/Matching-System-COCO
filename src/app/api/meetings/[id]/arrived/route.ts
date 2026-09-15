import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { castArriveAtMeeting, startMeeting } from '@/server/services/meetings/lifecycle';
import { broadcastReloadPage } from '@/server/services/notifications';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/arrived */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const attendance = await prisma.castAttendance.findFirst({
    where: { meetingId: params.id, userId: user.id },
  });
  if (!attendance) throw new AppError('参加記録が見つかりません', { statusCode: 400 });

  await castArriveAtMeeting(attendance.id);

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  if (meeting.status === 'scheduled') await startMeeting(meeting.id);

  await broadcastReloadPage(meeting.ownerId, meeting.conversationId);

  return { ok: true, redirect: `/conversations/${meeting.conversationId ?? ''}` };
});
