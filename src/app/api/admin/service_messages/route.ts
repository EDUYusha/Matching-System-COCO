import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/service_messages */
export const GET = route(async (_request, { searchParams }) => listResource('service_messages', searchParams));
export const POST = route(async (request) => createResource('service_messages', await jsonBody(request)));
