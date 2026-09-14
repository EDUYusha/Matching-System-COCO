import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { env } from '@/server/config/env';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/access_requests/:userId/picture — the identity document. */
export const GET = route<{ userId: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ userId: z.coerce.number() }).parse(routeParams);

  const accessRequest = await prisma.accessRequest.findUnique({ where: { userId: params.userId } });
  if (!accessRequest?.uploadedPicture) throw new AppError('画像がありません', { statusCode: 404 });

  const path = join(env.castPicturesDir, accessRequest.uploadedPicture);
  if (!existsSync(path)) throw new AppError('画像がありません', { statusCode: 404 });

  const extension = accessRequest.uploadedPicture.split('.').pop()?.toLowerCase();
  // identity documents must never be cached by a shared proxy
  return new Response(new Uint8Array(await readFile(path)), {
    headers: {
      'Content-Type': extension === 'png' ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  });
});
