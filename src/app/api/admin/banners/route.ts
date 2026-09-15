import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/banners */
export const GET = route(async (_request, { searchParams }) => listResource('banners', searchParams));
export const POST = route(async (request) => createResource('banners', await jsonBody(request)));
