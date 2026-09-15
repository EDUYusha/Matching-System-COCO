import { z } from 'zod';
import { updateAttributeEntries } from '@/server/services/users';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: POST /profile/attributes */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ entries: z.record(z.unknown()) }).parse(await jsonBody(request));

  const ok = await updateAttributeEntries(user.id, body.entries);
  return ok
    ? { ok: true, redirect: '/profile/settings', flash: { type: 'notice', message: '更新しました。' } }
    : { ok: false, redirect: '/profile/settings', flash: { type: 'alert', message: '失敗しました' } };
});
