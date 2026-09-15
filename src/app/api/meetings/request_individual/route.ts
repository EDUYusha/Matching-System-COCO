import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { OrderValidationError } from '@/server/lib/errors';
import { setUpIndividualMeetingRequest } from '@/server/services/meetings/setup';
import { buildOrderRequestMeeting, orderRequestFormSchema } from '@/server/services/order-forms';
import { requireGate } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
import { failMeeting } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/request_individual */
export const POST = route(async (request) => {
  const user = await requireGate('order');
  const form = orderRequestFormSchema.parse(await jsonBody(request));
  const { meeting: data } = await buildOrderRequestMeeting(form, user.id);

  const meeting = await prisma.meeting.create({
    data: {
      ...(data as unknown as Prisma.MeetingUncheckedCreateInput),
      castAttendances: { create: [{ userId: user.id, role: 'requested', decisionBy: 'cast' }] },
    },
  });

  try {
    await setUpIndividualMeetingRequest(meeting.id);
  } catch (error) {
    await failMeeting(meeting.id);
    throw new OrderValidationError(`エラー： ${(error as Error).message}`);
  }

  return { ok: true, meetingId: meeting.id, flash: { type: 'notice', message: '依頼登録しました' } };
});
