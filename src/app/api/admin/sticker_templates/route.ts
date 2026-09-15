import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/sticker_templates */
export const GET = route(async (_request, { searchParams }) => listResource('sticker_templates', searchParams));
export const POST = route(async (request) => createResource('sticker_templates', await jsonBody(request)));
