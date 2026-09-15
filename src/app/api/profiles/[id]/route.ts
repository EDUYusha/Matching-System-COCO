import { z } from 'zod';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { buildProfile, makeFootprint } from '@/server/api/profiles-shared';
export const dynamic = 'force-dynamic';

/** profiles: GET /profiles/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('search');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const profile = await buildProfile(user.id, params.id);
  await makeFootprint(user.id, params.id);
  return { profile };
});
