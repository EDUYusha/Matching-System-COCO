import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/business_areas */
export const GET = route(async (_request, { searchParams }) => listResource('business_areas', searchParams));
export const POST = route(async (request) => createResource('business_areas', await jsonBody(request)));
