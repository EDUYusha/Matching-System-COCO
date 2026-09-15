import { z } from 'zod';
import { cancelMeeting } from '@/server/services/meetings/finances';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/meetings/:id/cancel */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      informParticipants: z.enum(['nobody', 'all', 'owner', 'cast']).optional(),
      chargeBack: z.boolean().optional(),
      errorMessage: z.string().optional(),
      cancelFee: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request) ?? {});

  await cancelMeeting({
    meetingId: params.id,
    informParticipants: body.informParticipants,
    chargeBack: body.chargeBack,
    errorMessage: body.errorMessage ?? null,
    cancelFee: body.cancelFee ?? 0,
  });
  return { ok: true };
});
