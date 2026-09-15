import { AN } from '@/lib';
import { Prisma } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { createSystemMessage } from '@/server/services/messages';

/**
 * Ports the Conversation model's factory methods and `with_partner` scope.
 *
 * A conversation's title is stored twice on purpose: `conversations.name` is the
 * shared title (meetings, the operator room), while `speakers.conversation_name`
 * overrides it per participant so each side of a private chat sees the other
 * person's nickname.
 */

/** Conversation.create_for_system! — the one-way announcements room. */
export async function createSystemConversation(userId: number, tx?: Tx) {
  return transaction(tx, async (t) =>
    t.conversation.create({
      data: {
        category: 'system',
        name: `${AN.Short}運営局からのお知らせ`,
        speakers: { create: [{ userId }] },
      },
    }),
  );
}

/** Conversation.create_for_admin! — the inbound support room, joined by all admins. */
export async function createAdminConversation(userId: number, tx?: Tx) {
  return transaction(tx, async (t) => {
    const admins = await t.user.findMany({ where: { userType: 'admin', discardedAt: null }, select: { id: true } });
    const conversation = await t.conversation.create({
      data: {
        category: 'admin',
        name: `${AN.Short} 運営局　お問合せ用`,
        speakers: {
          create: [{ userId }, ...admins.map((admin) => ({ userId: admin.id, role: 'support' }))],
        },
      },
    });

    await createSystemMessage(
      {
        conversationId: conversation.id,
        content: 'TOLA運営局へのお問い合わせは、下の「メッセージを送る」からお願いいたします。\n',
      },
      t,
    );

    return conversation;
  });
}

/** Conversation.create_for_operator! — per-branch support room. */
export async function createOperatorConversation(userId: number, businessAreaId: number, tx?: Tx) {
  return transaction(tx, async (t) => {
    const businessArea = await t.businessArea.findUniqueOrThrow({ where: { id: businessAreaId } });
    const operators = await t.user.findMany({
      where: { userType: 'operator', businessAreaId, discardedAt: null },
      select: { id: true },
    });
    const conversation = await t.conversation.create({
      data: {
        category: 'operator',
        name: `${AN.Short} 運営局 - ${businessArea.name}`,
        speakers: {
          create: [{ userId }, ...operators.map((operator) => ({ userId: operator.id, role: 'support' }))],
        },
      },
    });

    await createSystemMessage(
      {
        conversationId: conversation.id,
        content: `これは${businessArea.name}の支店のサポートチャットルームです。お気軽にオペレーターに問い合わせしてください。\n`,
      },
      t,
    );

    return conversation;
  });
}

/** Conversation.create_for_2p! — a private room between two users. */
export async function createPrivateConversation(userAId: number, userBId: number, tx?: Tx) {
  return transaction(tx, async (t) => {
    const [userA, userB] = await Promise.all([
      t.user.findUniqueOrThrow({ where: { id: userAId }, select: { id: true, nickName: true } }),
      t.user.findUniqueOrThrow({ where: { id: userBId }, select: { id: true, nickName: true } }),
    ]);
    return t.conversation.create({
      data: {
        category: 'private',
        name: 'Private Chat',
        speakers: {
          create: [
            { userId: userA.id, conversationName: userB.nickName },
            { userId: userB.id, conversationName: userA.nickName },
          ],
        },
      },
    });
  });
}

/** Conversation.create_for_meeting! — the group room opened once an order matches. */
export async function createMeetingConversation(
  meeting: { id: number; ownerId: number; summary: string },
  options: { pictureUrl?: string | null } = {},
  tx?: Tx,
) {
  return transaction(tx, async (t) => {
    const attendances = await t.castAttendance.findMany({
      where: { meetingId: meeting.id, role: { not: 'out' } },
      select: { userId: true },
    });
    return t.conversation.create({
      data: {
        category: 'meeting',
        name: meeting.summary,
        pictureUrl: options.pictureUrl ?? null,
        speakers: {
          create: [
            { userId: meeting.ownerId, role: 'owner' },
            ...attendances.map((attendance) => ({ userId: attendance.userId, role: 'cast' })),
          ],
        },
      },
    });
  });
}

/**
 * Conversation.with_partner — finds the rooms shared by `me` and `partner`.
 *
 * `partner` may be a user id or a nickname fragment (the chat search box). By
 * default rooms the viewer has muted by blocking are excluded, matching the
 * `me.ignoring = false` join condition.
 */
export async function conversationsWithPartner(
  meId: number,
  partner: number | string | null,
  options: { onlyPrivate?: boolean; includeIgnored?: boolean; limit?: number } = {},
): Promise<Array<{ id: number }>> {
  if (partner === null || partner === undefined || partner === '') return [];

  const partnerId = typeof partner === 'number' ? partner : /^\d+$/.test(partner) ? Number(partner) : null;
  const partnerName = partnerId === null ? String(partner) : null;
  if (partnerId !== null && partnerId === meId) return [];

  const conditions: Prisma.Sql[] = [
    Prisma.sql`me.user_id = ${meId}`,
    ...(options.includeIgnored ? [] : [Prisma.sql`me.ignoring = false`]),
  ];
  if (options.onlyPrivate) conditions.push(Prisma.sql`conversations.category = 'private'`);

  const partnerJoin = partnerId
    ? Prisma.sql`JOIN speakers partner ON partner.conversation_id = conversations.id AND partner.user_id = ${partnerId}`
    : Prisma.sql`
        JOIN speakers partner ON partner.conversation_id = conversations.id
        JOIN users partner_user ON partner.user_id = partner_user.id AND partner_user.nick_name LIKE ${`%${partnerName}%`}
      `;

  const limitClause = options.limit ? Prisma.sql`LIMIT ${options.limit}` : Prisma.empty;

  return prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT DISTINCT conversations.id, conversations.updated_at
    FROM conversations
    JOIN speakers me ON me.conversation_id = conversations.id
    ${partnerJoin}
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY conversations.updated_at DESC
    ${limitClause}
  `);
}

/** First shared room, the form `Conversation.with_partner(...).limit(1).first` took. */
export async function findConversationWithPartner(
  meId: number,
  partnerId: number | string,
  options: { onlyPrivate?: boolean; includeIgnored?: boolean } = {},
): Promise<number | null> {
  const rows = await conversationsWithPartner(meId, partnerId, { ...options, limit: 1 });
  return rows[0]?.id ?? null;
}

/** The user's announcements room, created lazily like SystemMessage.to_user does. */
export async function findOrCreateSystemConversation(userId: number, tx?: Tx): Promise<number> {
  const client = tx ?? prisma;
  const existing = await client.conversation.findFirst({
    where: { category: 'system', speakers: { some: { userId } } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await createSystemConversation(userId, tx);
  return created.id;
}

/** Conversation#effective_name — the per-speaker override wins. */
export function effectiveConversationName(
  conversation: { name: string },
  speaker?: { conversationName: string | null } | null,
): string {
  return speaker?.conversationName || conversation.name;
}

/**
 * User#fix_conversation_names — after a nickname change, refresh the title the
 * partner sees in every private room.
 */
export async function fixConversationNames(userId: number, newNickName: string, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const conversations = await client.conversation.findMany({
    where: { category: 'private', speakers: { some: { userId } } },
    select: { id: true },
  });
  if (!conversations.length) return;
  await client.speaker.updateMany({
    where: { conversationId: { in: conversations.map((c) => c.id) }, userId: { not: userId } },
    data: { conversationName: newNickName },
  });
}
