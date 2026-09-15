import { z } from 'zod';
import { destroyPost } from '@/server/services/posts';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: DELETE /posts/:id */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('post');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await destroyPost(params.id, user.id);
  return { ok: true, flash: { type: 'notice', message: '削除しました。' } };
});
