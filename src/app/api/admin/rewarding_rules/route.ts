import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/rewarding_rules */
export const GET = route(async (_request, { searchParams }) => listResource('rewarding_rules', searchParams));
export const POST = route(async (request) => createResource('rewarding_rules', await jsonBody(request)));
