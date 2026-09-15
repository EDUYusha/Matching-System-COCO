import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { tokyoStartOfDay } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError, OrderValidationError } from '@/server/lib/errors';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { toCastAttendanceDto, toMeetingSummary, type MeetingRow } from '@/server/lib/serializers';
import { blockedUserIds } from '@/server/services/blockings';
import { availableForWhere, ORDER_BY_JOINABILITY } from '@/server/services/meetings/model';
import { assertCanOrder, setUpMeeting } from '@/server/services/meetings/setup';
import {
  buildGroupMeeting,
  normaliseOrderForm,
  orderFormSchema,
  validateOrderForm
} from '@/server/services/order-forms';
import { requireGate } from '@/server/auth/session';
import { jsonBody, queryObject, route } from '@/server/http/route';
import { MEETING_INCLUDE } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireGate('order');
  if (user.userType === 'customer' || user.userType === 'inviter') {
    throw new ForbiddenError('その操作はできません。', '/conversations');
  }

  const query = z
    .object({
      tab: z.enum(['available', 'later', 'planned', 'requested']).optional(),
      special: z.string().optional(),
      page: z.coerce.number().optional(),
    })
    .parse(queryObject(searchParams));

  const tab = query.tab ?? 'available';
  const page = query.page ?? 1;
  const pagination = paginationArgs(page, 20);

  const { blockedByMe, blockingMe } = await blockedUserIds(user.id);
  const blockedOwnerIds = [...blockedByMe, ...blockingMe];

  // Date.tomorrow + 6.hours in Tokyo: the cut between the two recruitment lists
  const tomorrowSix = new Date(tokyoStartOfDay(new Date(), 6).getTime() + 24 * 60 * 60 * 1000);

  let where: Prisma.MeetingWhereInput;
  let orderBy: Prisma.MeetingOrderByWithRelationInput[] | undefined;
  let useJoinabilityOrder = false;

  if (tab === 'requested') {
    where = {
      status: 'requested',
      category: 'individual',
      castAttendances: { some: { userId: user.id, role: 'requested' } },
      ...(blockedOwnerIds.length ? { ownerId: { notIn: blockedOwnerIds } } : {}),
    };
    orderBy = [{ plannedStartTime: 'asc' }];
  } else if (tab === 'planned') {
    where = {
      status: { in: ['requested', 'cast_selectable', 'scheduled'] },
      castAttendances: { some: { userId: user.id, role: { not: 'out' } } },
    };
    orderBy = [{ plannedStartTime: 'asc' }];
  } else {
    const availableWhere = availableForWhere(user, { blockedIds: blockedOwnerIds });
    if (!availableWhere) return paginate([], 0, page, 20);
    where =
      tab === 'later'
        ? { ...availableWhere, plannedStartTime: { gt: tomorrowSix } }
        : { ...availableWhere, plannedStartTime: { lt: tomorrowSix } };
    useJoinabilityOrder = true;
  }

  const totalCount = await prisma.meeting.count({ where });

  let meetings: Array<Prisma.MeetingGetPayload<{ include: typeof MEETING_INCLUDE }>>;
  if (useJoinabilityOrder) {
    // Meeting.order_by_joinability needs raw SQL for its CASE expression
    const ids = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM meetings
      WHERE id IN (${Prisma.join(
        (await prisma.meeting.findMany({ where, select: { id: true } })).map((row) => row.id).length
          ? (await prisma.meeting.findMany({ where, select: { id: true } })).map((row) => row.id)
          : [-1],
      )})
      ORDER BY ${ORDER_BY_JOINABILITY}
      LIMIT ${pagination.take} OFFSET ${pagination.skip}
    `);
    const rows = await prisma.meeting.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: MEETING_INCLUDE,
    });
    meetings = ids
      .map((row) => rows.find((candidate) => candidate.id === row.id))
      .filter((row): row is (typeof rows)[number] => !!row);
  } else {
    meetings = await prisma.meeting.findMany({ where, include: MEETING_INCLUDE, orderBy, ...pagination });
  }

  const ownerAttributes = await prisma.attribute.findMany({
    where: { name: { in: ['年収', 'お仕事'] }, userId: { in: meetings.map((meeting) => meeting.ownerId) } },
    select: { userId: true, name: true, value: true },
  });
  const meetingPreferences = await prisma.meetingPreferencesSchema.findMany();

  const requestCount = query.special
    ? totalCount
    : await prisma.meeting.count({
        where: {
          status: 'requested',
          category: 'individual',
          castAttendances: { some: { userId: user.id, role: 'requested' } },
        },
      });

  return {
    ...paginate(
      meetings.map((meeting) => {
        const myAttendance = meeting.castAttendances.find((attendance) => attendance.userId === user.id);
        return toMeetingSummary(meeting as unknown as MeetingRow, {
          ownerAttributes: ownerAttributes.filter((attribute) => attribute.userId === meeting.ownerId),
          myAttendance: myAttendance ? toCastAttendanceDto(myAttendance) : null,
        });
      }),
      totalCount,
      page,
      20,
    ),
    requestCount,
    meetingPreferences: meetingPreferences.map((preference) => ({
      id: preference.id,
      name: preference.name,
      category: preference.category,
      subcategory: preference.subcategory,
      score: preference.score,
      selected: false,
    })),
  };
});

/** meetings: POST /meetings */
export const POST = route(async (request) => {
  const user = await requireGate('order');
  await assertCanOrder(user.id);

  const form = normaliseOrderForm(orderFormSchema.parse(await jsonBody(request)));
  await validateOrderForm(form);
  const data = await buildGroupMeeting(form, user.id);

  const meeting = await prisma.meeting.create({ data: data as unknown as Prisma.MeetingUncheckedCreateInput });

  try {
    await setUpMeeting(meeting.id);
  } catch (error) {
    throw new OrderValidationError(`An error occurred: ${(error as Error).message}`);
  }

  const systemConversation = await prisma.conversation.findFirst({
    where: { category: 'system', speakers: { some: { userId: user.id } } },
    select: { id: true },
  });

  return { ok: true, meetingId: meeting.id, redirect: `/conversations/${systemConversation?.id ?? ''}` };
});
