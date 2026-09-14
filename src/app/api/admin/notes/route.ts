import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: POST /admin/notes */
export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = z
    .object({ itemType: z.string(), itemId: z.coerce.number(), content: z.string().min(1) })
    .parse(await jsonBody(request));

  const note = await prisma.note.create({
    data: { itemType: body.itemType, itemId: body.itemId, content: body.content, adminId: admin.id },
  });
  return { ok: true, note };
});
