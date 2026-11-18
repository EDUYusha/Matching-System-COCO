import { prisma } from '@/server/lib/prisma';
import { cancelMeeting, type InformTarget } from '@/server/services/meetings/finances';
import { railsFlag, railsPresence, railsToInt, requestParams } from '@/server/http/params';
import { internalApiRoute, railsServerError, RailsRecordNotFound } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/meetings/:meetingId/cancel
 *
 * No status guard, as in the old action: an operator can cancel an order in any
 * state. All four parameters arrive as form fields, and all four are coerced
 * rather than validated — `cancel_fee=abc` charged 0 in the old system and must
 * charge 0 here, because a validation error in the response is read by the panel
 * as a completed cancellation.
 */
export const POST = internalApiRoute<{ meetingId: string }>(async (request, { params }) => {
  const body = await requestParams(request);

  // `Meeting.find` ran before the interactor, so a missing order is a 404
  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();

  try {
    await cancelMeeting({
      meetingId: meeting.id,
      informParticipants: (railsPresence(body.inform_participants) as InformTarget | null) ?? undefined,
      chargeBack: railsFlag(body.charge_back),
      errorMessage: railsPresence(body.error_message),
      cancelFee: railsToInt(body.cancel_fee),
    });
  } catch (error) {
    // CancelMeeting ran with `call!`, so a failure reached the action's rescue
    // and was rendered as a 500 with the interactor's message
    throw railsServerError((error as Error).message);
  }
});
