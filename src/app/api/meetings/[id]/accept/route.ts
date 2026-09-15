import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { acceptIndividualMeeting } from '@/server/services/meetings/lifecycle';
import { broadcastReloadPage } from '@/server/services/notifications';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/accept */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  // the original took a row lock around the accept
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    select: { id: true, conversationId: true, ownerId: true },
  });

  await acceptIndividualMeeting(meeting.id, user.id);

  // the cast's screen has to refresh when the guest is the one accepting
  if (user.id === meeting.ownerId) {
    const firstAttendance = await prisma.castAttendance.findFirst({
      where: { meetingId: meeting.id, role: { not: 'out' } },
      orderBy: { id: 'asc' },
    });
    if (firstAttendance) await broadcastReloadPage(firstAttendance.userId, meeting.conversationId);
  }

  return {
    ok: true,
    redirect: `/conversations/${meeting.conversationId ?? ''}`,
    flash: { type: 'notice', message: 'ありがとうございます。' },
  };
});
