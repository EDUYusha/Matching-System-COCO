import { createBlocking } from '@/server/services/blockings';
import { asParams, railsToInt, requestParams } from '@/server/http/params';
import { internalApiRoute, railsOk, RailsParameterMissing } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/blockings
 *
 * `blocking[user_id]` and `blocking[target_id]`, and nothing else was permitted.
 * The old action rendered nothing at all, which Rails sent as an empty 204, and
 * it used `save!`, so a validation failure was an unrescued exception — a 500
 * with Rails' error page rather than a JSON body.
 */
export const POST = internalApiRoute(async (request) => {
  const body = await requestParams(request);
  if (body.blocking === undefined) throw new RailsParameterMissing('blocking');
  const blocking = asParams(body.blocking);

  await createBlocking(railsToInt(blocking.user_id), railsToInt(blocking.target_id));
  return railsOk(204);
});
