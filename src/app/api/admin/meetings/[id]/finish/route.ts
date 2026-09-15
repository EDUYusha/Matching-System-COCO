import { z } from 'zod';
import { markMeetingFinished } from '@/server/services/meetings/lifecycle';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/meetings/:id/finish */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({ endTime: z.string().optional(), finishMessage: z.string().optional(), noMessages: z.boolean().optional() })
    .parse(await jsonBody(request) ?? {});

  await markMeetingFinished(params.id, {
    endTime: body.endTime ? new Date(body.endTime) : null,
    finishMessage: body.finishMessage ?? null,
    noMessages: body.noMessages,
  });
  return { ok: true };
});
