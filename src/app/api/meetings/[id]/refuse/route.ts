import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
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
    select: { id: true, conversationId: true, ownerId: true, status: true, category: true },
  });

  // Refusing answers an individual request that is still waiting on this user:
  // the guest answers a cast's proposal (cast_requested), the cast answers the
  // guest's request (requested). Neither refusal releases frozen credits, so it
  // must never reach a group order or a scheduled one; those are cancelled from
  // the admin panel, which does release them.
  const isOwner = meeting.ownerId === user.id;
  const awaitingThisUser = isOwner ? meeting.status === 'cast_requested' : meeting.status === 'requested';
  if (meeting.category !== 'individual' || !awaitingThisUser) {
    throw new ForbiddenError('その操作はできません。', `/conversations/${meeting.conversationId ?? ''}`);
  }

  if (isOwner) {
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
