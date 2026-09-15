import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { autoOpenMeeting } from '@/server/services/meetings/selection';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/open */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  if (meeting.ownerId !== user.id) throw new ForbiddenError('権利がありません', '/conversations');

  const { conversationId } = await autoOpenMeeting(meeting.id);
  return { ok: true, redirect: `/conversations/${conversationId}` };
});
