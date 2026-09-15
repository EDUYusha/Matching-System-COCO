import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { type MeetingRow } from '@/server/lib/serializers';
import { toMeetingSummary } from '@/server/lib/serializers';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/meetings */
export const GET = route(async (_request, { searchParams }) => {
  const admin = await requireAdmin();
  const query = z
    .object({
      status: z.string().optional(),
      category: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      ownerId: z.coerce.number().optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));

  const page = query.page ?? 1;
  const where: Prisma.MeetingWhereInput = {
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.category ? { category: query.category as never } : {}),
    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    ...(query.from || query.to
      ? {
          plannedStartTime: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(admin.businessAreaId ? { area: { businessAreaId: admin.businessAreaId } } : {}),
  };

  const [meetings, totalCount] = await Promise.all([
    prisma.meeting.findMany({
      where,
      include: {
        area: true,
        castRank: true,
        owner: { include: { customerLevel: true } },
        castAttendances: { include: { user: { include: { castLevel: true } } } },
      },
      orderBy: { plannedStartTime: 'desc' },
      ...paginationArgs(page, 50),
    }),
    prisma.meeting.count({ where }),
  ]);

  return paginate(
    meetings.map((meeting) => ({
      ...toMeetingSummary(meeting as unknown as MeetingRow),
      cast: meeting.castAttendances.map((attendance) => ({
        id: attendance.id,
        userId: attendance.userId,
        nickName: attendance.user.nickName,
        role: attendance.role,
        decisionBy: attendance.decisionBy,
        startTime: attendance.startTime?.toISOString() ?? null,
        endTime: attendance.endTime?.toISOString() ?? null,
        serviceFeePermille: attendance.serviceFeePermille,
      })),
    })),
    totalCount,
    page,
    50,
  );
});
