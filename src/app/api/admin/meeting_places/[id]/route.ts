import { z } from 'zod';
import { destroyResource, showResource, updateResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

const idSchema = z.object({ id: z.coerce.number() });

/** admin settings: GET|PATCH|DELETE /admin/meeting_places/:id */
export const GET = route<{ id: string }>(async (_request, { params }) =>
  showResource('meeting_places', idSchema.parse(params).id),
);

export const PATCH = route<{ id: string }>(async (request, { params }) =>
  updateResource('meeting_places', idSchema.parse(params).id, await jsonBody(request)),
);

export const DELETE = route<{ id: string }>(async (_request, { params }) =>
  destroyResource('meeting_places', idSchema.parse(params).id),
);
