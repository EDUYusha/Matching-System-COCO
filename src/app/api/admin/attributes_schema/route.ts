import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/attributes_schema */
export const GET = route(async (_request, { searchParams }) => listResource('attributes_schema', searchParams));
export const POST = route(async (request) => createResource('attributes_schema', await jsonBody(request)));
