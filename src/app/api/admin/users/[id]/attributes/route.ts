import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: PATCH /admin/users/:id/attributes */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ entries: z.record(z.string().nullable()) }).parse(await jsonBody(request));

  const { sanitizeProfileHtml } = await import('@/server/lib/sanitize');
  for (const [name, value] of Object.entries(body.entries)) {
    const attribute = await prisma.attribute.findUnique({
      where: { userId_name: { userId: params.id, name } },
    });
    if (!attribute) continue;
    await prisma.attribute.update({
      where: { id: attribute.id },
      data: { value: attribute.valueType === 'Text' ? sanitizeProfileHtml(value) : value },
    });
  }
  return { ok: true };
});
