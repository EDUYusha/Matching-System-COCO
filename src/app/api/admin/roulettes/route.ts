import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/roulettes */
export const GET = route(async (_request, { searchParams }) => listResource('roulettes', searchParams));
export const POST = route(async (request) => createResource('roulettes', await jsonBody(request)));
