import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { setupCastSelection } from '@/server/services/meetings/selection';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/add_cast */
export const POST = route<{ meetingId: string }>(async (request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      cast_attendance: z.object({
        user_id: z.coerce.number(),
        role: z.enum(['attending', 'unconfirmed', 'requested', 'out']),
        additional_score: z.coerce.number().optional(),
      }),
    })
    .parse(await jsonBody(request));

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });

  try {
    await prisma.castAttendance.create({
      data: {
        meetingId: meeting.id,
        userId: body.cast_attendance.user_id,
        role: body.cast_attendance.role,
        additionalScore: body.cast_attendance.additional_score ?? 0,
        decisionBy: 'operator',
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError('キャストは既に参加します');
    }
    throw error;
  }

  // safe to call repeatedly: it only acts while the status is still 'requested'
  const activeCount = await prisma.castAttendance.count({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  if (activeCount >= meeting.neededPersonCount) await setupCastSelection(meeting.id);

  return { ok: true };
});
