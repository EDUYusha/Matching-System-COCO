import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/meeting_place_tags */
export const GET = route(async (_request, { searchParams }) => listResource('meeting_place_tags', searchParams));
export const POST = route(async (request) => createResource('meeting_place_tags', await jsonBody(request)));
