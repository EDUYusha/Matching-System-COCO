import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import {
  castRefuseIndividualMeeting,
  customerRefuseIndividualMeetingRequest
} from '@/server/services/meetings/lifecycle';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/refuse */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    select: { id: true, conversationId: true, ownerId: true, status: true },
  });

  if (meeting.ownerId === user.id) {
    await customerRefuseIndividualMeetingRequest(meeting.id, user.id);
  } else {
    await castRefuseIndividualMeeting(meeting.id, user.id);
  }

  return {
    ok: true,
    redirect: `/conversations/${meeting.conversationId ?? ''}`,
    flash: { type: 'notice', message: '参加依頼を辞退しました。' },
  };
});
