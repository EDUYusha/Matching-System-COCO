import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/areas */
export const GET = route(async (_request, { searchParams }) => listResource('areas', searchParams));
export const POST = route(async (request) => createResource('areas', await jsonBody(request)));
