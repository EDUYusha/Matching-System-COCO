import { AppError } from '@/server/lib/errors';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: GET /cast/agreement */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const { access } = await import('@/lib');
  if (!access(user.accessLevel, 'accept_terms')) {
    throw new AppError('権限がありません。', { statusCode: 403, redirect: '/' });
  }
  return { ok: true };
});
