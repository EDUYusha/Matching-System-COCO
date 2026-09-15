import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { toConversationSummary } from '@/server/lib/serializers';
import { createMessage, unreadCountsByConversation } from '@/server/services/messages';
import { createPrivateConversation, findConversationWithPartner } from '@/server/services/conversations';
import { enqueueMessageBroadcast } from '@/server/jobs/queues';
import { requireUser } from '@/server/auth/session';
import { jsonBody, queryObject, route } from '@/server/http/route';
import { PER_PAGE, loadPrivatePartners } from '@/server/api/conversations-shared';
export const dynamic = 'force-dynamic';

/** conversations: GET /conversations */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireUser();
  const query = z
    .object({ page: z.coerce.number().optional(), meetings: z.string().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const where: Prisma.ConversationWhereInput = {
    speakers: { some: { userId: user.id, ignoring: false } },
    ...(query.meetings !== undefined ? { category: 'meeting' } : {}),
  };

  // `ORDER BY category = 'admin' DESC, updated_at DESC` — the support room is
  // pinned to the very top, which has to happen in SQL so it stays first even
  // when it would otherwise fall onto a later page.
  const { skip, take } = paginationArgs(page, PER_PAGE);
  const categoryFilter =
    query.meetings !== undefined ? Prisma.sql`AND conversations.category = 'meeting'` : Prisma.empty;

  const [orderedIds, totalCount] = await Promise.all([
    prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT conversations.id
      FROM conversations
      JOIN speakers ON speakers.conversation_id = conversations.id
        AND speakers.user_id = ${user.id} AND speakers.ignoring = false
      WHERE TRUE ${categoryFilter}
      ORDER BY (conversations.category = 'admin') DESC, conversations.updated_at DESC NULLS LAST
      LIMIT ${take} OFFSET ${skip}
    `),
    prisma.conversation.count({ where }),
  ]);

  const rows = orderedIds.length
    ? await prisma.conversation.findMany({
        where: { id: { in: orderedIds.map((row) => row.id) } },
        include: { speakers: true },
      })
    : [];
  const conversations = orderedIds
    .map((row) => rows.find((candidate) => candidate.id === row.id))
    .filter((row): row is (typeof rows)[number] => !!row);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const unreadCounts = await unreadCountsByConversation(user.id, conversationIds);
  const partners = await loadPrivatePartners(user, conversationIds);

  return paginate(
    conversations.map((conversation) =>
      toConversationSummary(conversation, {
        unreadCount: unreadCounts[conversation.id] ?? 0,
        partner: partners.get(conversation.id) ?? null,
        mySpeaker: conversation.speakers.find((speaker) => speaker.userId === user.id) ?? null,
        speakerCount: conversation.speakers.length,
      }),
    ),
    totalCount,
    page,
    PER_PAGE,
  );
});

/** conversations: POST /conversations */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z
    .object({ userId: z.coerce.number(), withIntroMessage: z.boolean().optional() })
    .parse(await jsonBody(request));

  const existing = await findConversationWithPartner(user.id, body.userId, {
    onlyPrivate: true,
    includeIgnored: true,
  });
  if (existing) return { ok: true, conversationId: existing, redirect: `/conversations/${existing}` };

  const partner = await prisma.user.findUniqueOrThrow({ where: { id: body.userId } });
  const conversation = await createPrivateConversation(user.id, partner.id);

  const marker = await createMessage({
    conversationId: conversation.id,
    senderId: user.id,
    category: 'internal',
    content: '<img src="/system/profile-liked.png">',
    withUnread: true,
    withBroadcast: false,
    withoutFormat: true,
  });

  const { createSystemMessage } = await import('@/server/services/messages');
  await createSystemMessage({
    conversationId: conversation.id,
    content:
      'チャットルームでは、個人情報や連絡が取れるSNSやアプリ等の案内、他社競合ギャラ飲みサービスについてのお話は禁止させて頂いております。',
    withUnread: true,
    withBroadcast: true,
  });

  await enqueueMessageBroadcast(marker.id, [partner.id]);

  if (body.withIntroMessage && config.create_conversation_with_intro_message) {
    const introMessage = await prisma.introMessage.findUnique({ where: { userId: user.id } });
    if (introMessage) {
      const intro = await createMessage({
        conversationId: conversation.id,
        senderId: user.id,
        category: 'text',
        // IntroMessage#content_for
        content: introMessage.template.replaceAll('%name%', partner.nickName),
        withUnread: true,
        withBroadcast: false,
      });
      await enqueueMessageBroadcast(intro.id, [partner.id]);
    }
  }

  return { ok: true, conversationId: conversation.id, redirect: `/conversations/${conversation.id}` };
});
