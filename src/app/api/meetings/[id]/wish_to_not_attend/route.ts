import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/wish_to_not_attend */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: { castAttendances: true },
  });
  const active = meeting.castAttendances.filter((attendance) => attendance.role !== 'out');

  if (!active.some((attendance) => attendance.userId === user.id)) {
    throw new AppError("Can't leave a meeting you never joined!", { redirect: '/meetings' });
  }
  if (active.length <= meeting.neededPersonCount) {
    throw new AppError('There is not enough other cast for you to leave', { redirect: '/meetings' });
  }

  await prisma.castAttendance.updateMany({
    where: { meetingId: meeting.id, userId: user.id },
    data: { role: 'out', decisionBy: 'cast' },
  });

  return { ok: true, redirect: '/meetings', flash: { type: 'notice', message: '出ました。' } };
});
