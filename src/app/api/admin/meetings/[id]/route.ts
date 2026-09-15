import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { type MeetingRow } from '@/server/lib/serializers';
import { toMeetingSummary } from '@/server/lib/serializers';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/meetings/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      area: true,
      castRank: true,
      owner: { include: { customerLevel: true } },
      castAttendances: { include: { user: { include: { castLevel: true } }, creditTransaction: true } },
      reviews: true,
      preConversion: true,
      postConversion: true,
    },
  });

  const { calculateMeetingCosts } = await import('@/server/services/meetings/costs');
  const { attendanceEarnings } = await import('@/server/services/meetings/costs');
  const costs = await calculateMeetingCosts(meeting.id);

  return {
    meeting: toMeetingSummary(meeting as unknown as MeetingRow),
    calculationSettings: meeting.calculationSettings,
    operatorMessage: meeting.operatorMessage,
    preConversion: meeting.preConversion,
    postConversion: meeting.postConversion,
    reviews: meeting.reviews,
    cast: meeting.castAttendances.map((attendance) => ({
      id: attendance.id,
      userId: attendance.userId,
      nickName: attendance.user.nickName,
      role: attendance.role,
      decisionBy: attendance.decisionBy,
      startTime: attendance.startTime?.toISOString() ?? null,
      endTime: attendance.endTime?.toISOString() ?? null,
      serviceFeePermille: attendance.serviceFeePermille,
      additionalScore: attendance.additionalScore,
      leaderId: attendance.leaderId,
      costs: costs.get(attendance.id).toJSON(),
      earnings: attendanceEarnings(meeting, attendance, costs.get(attendance.id)),
      creditTransaction: attendance.creditTransaction,
    })),
    totalCosts: costs.total,
  };
});
