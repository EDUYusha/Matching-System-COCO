import { z } from 'zod';
import { paginationArgs } from '@/server/lib/pagination';
import {
  serviceMessagesFor,
  toServiceMessageDto,
  SERVICE_MESSAGES_PAGE_SIZE
} from '@/server/services/service-messages';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /service_messages */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireUser();
  const query = z.object({ page: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const messages = await serviceMessagesFor(user, {
    ...paginationArgs(page, SERVICE_MESSAGES_PAGE_SIZE),
  });

  return {
    items: messages.map((message) => toServiceMessageDto(message, user.lastServiceMessageReadAt)),
    page,
    perPage: SERVICE_MESSAGES_PAGE_SIZE,
    hasMore: messages.length === SERVICE_MESSAGES_PAGE_SIZE,
  };
});
