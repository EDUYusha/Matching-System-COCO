import { z } from 'zod';
import { completeMeeting } from '@/server/services/meetings/lifecycle';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/meetings/:id/complete */
export const POST = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  await completeMeeting(params.id);
  return { ok: true };
});
