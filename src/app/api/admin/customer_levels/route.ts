import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/customer_levels */
export const GET = route(async (_request, { searchParams }) => listResource('customer_levels', searchParams));
export const POST = route(async (request) => createResource('customer_levels', await jsonBody(request)));
