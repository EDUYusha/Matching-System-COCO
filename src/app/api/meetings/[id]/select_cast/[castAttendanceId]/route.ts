import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { autoOpenMeeting, selectCast } from '@/server/services/meetings/selection';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/select_cast/:castAttendanceId */
export const POST = route<{ id: string; castAttendanceId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z
    .object({ id: z.coerce.number(), castAttendanceId: z.coerce.number() })
    .parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  if (meeting.ownerId !== user.id) throw new ForbiddenError('権利がありません', '/conversations');
  if (meeting.status !== 'cast_selectable') {
    throw new AppError('Cast selection time is already over.', { redirect: '/home' });
  }

  await selectCast(meeting.id, params.castAttendanceId);

  const attendingCount = await prisma.castAttendance.count({
    where: { meetingId: meeting.id, role: 'attending' },
  });
  if (attendingCount >= meeting.neededPersonCount) {
    const { conversationId } = await autoOpenMeeting(meeting.id);
    return { ok: true, redirect: `/conversations/${conversationId}` };
  }

  return { ok: true, redirect: `/meetings/${meeting.id}`, flash: { type: 'notice', message: '選択しました！' } };
});
