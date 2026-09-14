import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/cast_levels */
export const GET = route(async (_request, { searchParams }) => listResource('cast_levels', searchParams));
export const POST = route(async (request) => createResource('cast_levels', await jsonBody(request)));
