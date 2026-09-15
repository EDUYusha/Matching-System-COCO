import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/users/:id/notes */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const admin = await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ content: z.string().min(1) }).parse(await jsonBody(request));

  const note = await prisma.note.create({
    data: { itemType: 'User', itemId: params.id, content: body.content, adminId: admin.id },
  });
  return { ok: true, noteId: note.id };
});
