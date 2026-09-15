import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/admins */
export const GET = route(async (_request, { searchParams }) => listResource('admins', searchParams));
export const POST = route(async (request) => createResource('admins', await jsonBody(request)));
