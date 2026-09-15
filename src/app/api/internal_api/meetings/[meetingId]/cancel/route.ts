import { z } from 'zod';
import { cancelMeeting, type InformTarget } from '@/server/services/meetings/finances';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/cancel */
export const POST = route<{ meetingId: string }>(async (request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      inform_participants: z.string().optional(),
      charge_back: z.string().optional(),
      error_message: z.string().optional(),
      cancel_fee: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request) ?? {});

  await cancelMeeting({
    meetingId: params.meetingId,
    informParticipants: (body.inform_participants as InformTarget | undefined) ?? undefined,
    chargeBack: body.charge_back === 'true' || body.charge_back === '1',
    errorMessage: body.error_message || null,
    cancelFee: body.cancel_fee ?? 0,
  });

  return { ok: true };
});
