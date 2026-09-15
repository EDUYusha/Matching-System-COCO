import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/roulette_entries */
export const GET = route(async (_request, { searchParams }) => listResource('roulette_entries', searchParams));
export const POST = route(async (request) => createResource('roulette_entries', await jsonBody(request)));
