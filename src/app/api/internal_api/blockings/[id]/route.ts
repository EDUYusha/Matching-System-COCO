import { destroyBlocking } from '@/server/services/blockings';
import { railsToInt } from '@/server/http/params';
import { internalApiRoute, railsOk } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/** internal-api: DELETE /internal_api/blockings/:id — empty 204, as the old action rendered nothing */
export const DELETE = internalApiRoute<{ id: string }>(async (_request, { params }) => {
  await destroyBlocking(railsToInt(params.id));
  return railsOk(204);
});
