import { prisma } from '@/server/lib/prisma';
import { toMeetingSummary, type MeetingRow } from '@/server/lib/serializers';
import { assertCanOrder } from '@/server/services/meetings/setup';
import {
  buildGroupMeeting,
  normaliseOrderForm,
  orderFormSchema,
  validateOrderForm
} from '@/server/services/order-forms';
import { requireGate } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/confirm */
export const POST = route(async (request) => {
  const user = await requireGate('order');
  await assertCanOrder(user.id);

  const form = normaliseOrderForm(orderFormSchema.parse(await jsonBody(request)));
  await validateOrderForm(form);
  const data = await buildGroupMeeting(form, user.id);

  const castRank = await prisma.castRank.findUniqueOrThrow({ where: { id: form.castRankId } });
  const area = await prisma.area.findUniqueOrThrow({ where: { id: form.areaId } });

  const preview = {
    ...data,
    id: 0,
    status: 'requested',
    anonymous: data.anonymous,
    conversationId: null,
    realEndTime: null,
    finalCosts: null,
    finalDiscount: 0,
    frozenCredits: 0,
    requestStartTime: null,
    requestEndTime: null,
    createdAt: new Date(),
    castRank,
    area,
    owner: null,
    castAttendances: [],
  };

  return { meeting: toMeetingSummary(preview as unknown as MeetingRow) };
});
