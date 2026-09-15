import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/event_campaigns */
export const GET = route(async (_request, { searchParams }) => listResource('event_campaigns', searchParams));
export const POST = route(async (request) => createResource('event_campaigns', await jsonBody(request)));
