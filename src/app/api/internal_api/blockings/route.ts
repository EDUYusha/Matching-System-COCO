import { z } from 'zod';
import { createBlocking } from '@/server/services/blockings';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/blockings */
export const POST = route(async (request) => {
  const body = z
    .object({ blocking: z.object({ user_id: z.coerce.number(), target_id: z.coerce.number() }) })
    .parse(await jsonBody(request));
  await createBlocking(body.blocking.user_id, body.blocking.target_id);
  return { ok: true };
});
