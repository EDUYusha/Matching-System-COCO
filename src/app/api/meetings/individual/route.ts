import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { OrderValidationError } from '@/server/lib/errors';
import { assertCanOrder, setUpIndividualMeeting } from '@/server/services/meetings/setup';
import { buildIndividualMeeting, individualOrderFormSchema } from '@/server/services/order-forms';
import { requireGate } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
import { failMeeting } from '@/server/api/meetings-shared';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/individual */
export const POST = route(async (request) => {
  const user = await requireGate('order');
  await assertCanOrder(user.id);

  const form = individualOrderFormSchema.parse(await jsonBody(request));
  const { meeting: data, castId } = await buildIndividualMeeting(form, user.id);

  const meeting = await prisma.meeting.create({ data: data as unknown as Prisma.MeetingUncheckedCreateInput });
  try {
    await setUpIndividualMeeting(meeting.id, castId);
  } catch (error) {
    await failMeeting(meeting.id);
    throw new OrderValidationError(`失敗になりました： ${(error as Error).message}`);
  }

  return { ok: true, meetingId: meeting.id, flash: { type: 'notice', message: '依頼登録しました' } };
});
