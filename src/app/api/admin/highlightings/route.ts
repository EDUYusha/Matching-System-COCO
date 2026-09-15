import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/highlightings */
export const GET = route(async (_request, { searchParams }) => listResource('highlightings', searchParams));
export const POST = route(async (request) => createResource('highlightings', await jsonBody(request)));
