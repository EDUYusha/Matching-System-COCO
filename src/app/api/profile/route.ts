import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { buildProfile } from '@/server/api/profiles-shared';
export const dynamic = 'force-dynamic';

/** profiles: GET /profile */
export const GET = route(async (_request) => {
  const user = await requireUser();
  return { profile: await buildProfile(user.id, user.id) };
});
