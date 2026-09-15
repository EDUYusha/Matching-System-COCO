import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/meeting_preferences_schema */
export const GET = route(async (_request, { searchParams }) => listResource('meeting_preferences_schema', searchParams));
export const POST = route(async (request) => createResource('meeting_preferences_schema', await jsonBody(request)));
