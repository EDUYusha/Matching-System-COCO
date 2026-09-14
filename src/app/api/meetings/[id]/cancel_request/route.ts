import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { createSystemMessage } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/cancel_request */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: { castAttendances: true },
  });

  if (meeting.status === 'cast_requested') {
    if (!meeting.castAttendances.some((attendance) => attendance.userId === user.id)) {
      throw new ForbiddenError('許可がありません。', `/conversations/${meeting.conversationId ?? ''}`);
    }
    await prisma.castAttendance.updateMany({
      where: { meetingId: meeting.id },
      data: { role: 'out', decisionBy: 'cast' },
    });
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'request_canceled_fail' } });
  } else if (meeting.status === 'requested') {
    if (meeting.ownerId !== user.id) {
      throw new ForbiddenError('許可がありません。', `/conversations/${meeting.conversationId ?? ''}`);
    }
    await prisma.castAttendance.updateMany({
      where: { meetingId: meeting.id },
      data: { role: 'out', decisionBy: 'customer' },
    });
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'request_canceled_fail' } });
  } else {
    throw new AppError('その操作はできません。', { redirect: `/conversations/${meeting.conversationId ?? ''}` });
  }

  if (meeting.conversationId) {
    await createSystemMessage({
      conversationId: meeting.conversationId,
      content: `${user.nickName}はオーダー依頼をキャンセルしました。`,
      withUnread: true,
      withBroadcast: true,
    });
  }

  return { ok: true, redirect: `/conversations/${meeting.conversationId ?? ''}` };
});
