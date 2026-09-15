import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { paginationArgs } from '@/server/lib/pagination';
import { toConversationSummary } from '@/server/lib/serializers';
import { unreadCountsByConversation } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
import { PER_PAGE, loadPrivatePartners } from '@/server/api/conversations-shared';
export const dynamic = 'force-dynamic';

/** conversations: GET /conversations/search */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireUser();
  const query = z
    .object({ partner_name: z.string().optional(), page: z.coerce.number().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;
  const searchString = query.partner_name ?? '';

  let conversations: Array<Prisma.ConversationGetPayload<{ include: { speakers: true } }>>;
  let flash: { type: 'alert'; message: string } | undefined;

  if (searchString.length < 3) {
    if (searchString.length > 0) flash = { type: 'alert', message: 'せめて文字３つ入力してください' };
    conversations = await prisma.conversation.findMany({
      where: { speakers: { some: { userId: user.id, ignoring: false } } },
      include: { speakers: true },
      orderBy: { updatedAt: 'desc' },
      ...paginationArgs(page, PER_PAGE),
    });
  } else {
    const rows = await prisma.conversation.findMany({
      where: {
        speakers: { some: { userId: user.id, ignoring: false } },
        AND: {
          speakers: {
            some: { userId: { not: user.id }, user: { nickName: { contains: searchString } } },
          },
        },
      },
      include: { speakers: true },
      orderBy: { updatedAt: 'desc' },
      ...paginationArgs(page, PER_PAGE),
    });
    conversations = rows;
  }

  const conversationIds = conversations.map((conversation) => conversation.id);
  const unreadCounts = await unreadCountsByConversation(user.id, conversationIds);
  const partners = await loadPrivatePartners(user, conversationIds);

  return {
    items: conversations.map((conversation) =>
      toConversationSummary(conversation, {
        unreadCount: unreadCounts[conversation.id] ?? 0,
        partner: partners.get(conversation.id) ?? null,
        mySpeaker: conversation.speakers.find((speaker) => speaker.userId === user.id) ?? null,
        speakerCount: conversation.speakers.length,
      }),
    ),
    page,
    perPage: PER_PAGE,
    totalCount: conversations.length,
    totalPages: 1,
    hasMore: conversations.length >= PER_PAGE,
    flash,
  };
});
