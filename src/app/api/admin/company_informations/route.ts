import { createResource, listResource } from '@/server/api/admin-crud';
import { jsonBody, route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin settings: GET|POST /admin/company_informations */
export const GET = route(async (_request, { searchParams }) => listResource('company_informations', searchParams));
export const POST = route(async (request) => createResource('company_informations', await jsonBody(request)));
