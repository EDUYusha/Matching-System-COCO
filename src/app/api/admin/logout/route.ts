import { clearAdminSession } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/logout */
export const POST = route(async () => {
  await clearAdminSession();
  return { ok: true };
});
