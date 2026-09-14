import type { MessageCategory } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { formatUserContent, truncate } from '@/server/lib/sanitize';
import { logger } from '@/server/lib/logger';
import { findOrCreateSystemConversation } from '@/server/services/conversations';
import { enqueueMessageBroadcast } from '@/server/jobs/queues';

/**
 * Ports the Message and SystemMessage models.
 *
 * The Ruby model carried four opt-in flags as attr_accessors, because most
 * call sites wanted only some of the side effects:
 *   with_unread                 → fan out unread_messages rows
 *   with_broadcast              → push over the socket, FCM and LINE
 *   without_conversation_update → skip refreshing the room's preview line
 *   without_format              → keep the content as-is (system markup)
 * They are the options below, with the same defaults.
 *
 * SystemMessage is the same table with sender_id pinned to 1 and formatting off.
 */

export const SYSTEM_USER_ID = 1;

export interface CreateMessageInput {
  conversationId: number;
  senderId: number;
  content: string;
  category?: MessageCategory;
  sentAt?: Date | null;
  withUnread?: boolean;
  withBroadcast?: boolean;
  withoutConversationUpdate?: boolean;
  withoutFormat?: boolean;
}

function previewFor(category: MessageCategory, content: string): string {
  switch (category) {
    case 'text':
      return truncate(content, 100);
    case 'picture':
      return '[写真]';
    case 'sticker':
      return '[スタンプ]';
    case 'internal':
      return '[内部メッセージ]';
    default:
      return '';
  }
}

/**
 * Message#add_unread_messages. One row per other speaker, pre-flagged as ignored
 * when that speaker has the sender blocked or has muted the room, so the unread
 * badge never counts messages the recipient will not be shown.
 */
async function addUnreadMessages(
  t: Tx,
  message: { id: number; conversationId: number; senderId: number },
): Promise<void> {
  const [speakers, blockers] = await Promise.all([
    t.speaker.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true, ignoring: true },
    }),
    t.blocking.findMany({ where: { targetId: message.senderId }, select: { userId: true } }),
  ]);
  const blockerIds = new Set(blockers.map((b) => b.userId));

  const rows = speakers
    .filter((speaker) => speaker.userId !== message.senderId)
    .map((speaker) => ({
      userId: speaker.userId,
      messageId: message.id,
      conversationId: message.conversationId,
      ignored: speaker.ignoring || blockerIds.has(speaker.userId),
    }));

  if (rows.length) await t.unreadMessage.createMany({ data: rows });
}

/** Message#sender_is_speaker_in_conversation (the system user is always allowed). */
async function assertSenderIsSpeaker(t: Tx, conversationId: number, senderId: number): Promise<void> {
  if (senderId === SYSTEM_USER_ID) return;
  const speaker = await t.speaker.findFirst({ where: { conversationId, userId: senderId }, select: { id: true } });
  if (!speaker) throw new Error('sender is not part of this conversation');
}

export async function createMessage(input: CreateMessageInput, tx?: Tx) {
  const category = input.category ?? 'text';

  const message = await transaction(tx, async (t) => {
    await assertSenderIsSpeaker(t, input.conversationId, input.senderId);

    // before_create :format_content — escape and linkify, text messages only
    const content =
      input.withoutFormat || category !== 'text' ? input.content : formatUserContent(input.content);

    const created = await t.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        content,
        category,
        sentAt: input.sentAt ?? new Date(),
      },
      include: { sender: { select: { id: true, nickName: true } } },
    });

    if (input.withUnread) await addUnreadMessages(t, created);

    if (!input.withoutConversationUpdate) {
      await t.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastContent: previewFor(category, created.content),
          lastSenderName: created.sender.nickName,
          lastSenderId: created.senderId,
          updatedAt: new Date(),
        },
      });
    }

    return created;
  });

  // after_commit :make_broadcast
  if (input.withBroadcast) await enqueueMessageBroadcast(message.id);

  return message;
}

export interface CreateSystemMessageInput {
  conversationId: number;
  content: string;
  category?: MessageCategory;
  withUnread?: boolean;
  withBroadcast?: boolean;
  withoutConversationUpdate?: boolean;
}

/** SystemMessage.create! — sender 1, never reformatted. */
export async function createSystemMessage(input: CreateSystemMessageInput, tx?: Tx) {
  return createMessage(
    {
      conversationId: input.conversationId,
      senderId: SYSTEM_USER_ID,
      content: input.content,
      category: input.category ?? 'text',
      withUnread: input.withUnread,
      withBroadcast: input.withBroadcast,
      withoutConversationUpdate: input.withoutConversationUpdate,
      withoutFormat: true,
    },
    tx,
  );
}

/**
 * SystemMessage.to_user — posts into the user's announcements room, creating it
 * first if the account predates that room existing.
 */
export async function systemMessageToUser(
  userId: number,
  input: { content: string; category?: MessageCategory; withUnread?: boolean; withBroadcast?: boolean },
  tx?: Tx,
) {
  const conversationId = await findOrCreateSystemConversation(userId, tx);
  return createSystemMessage(
    {
      conversationId,
      content: input.content,
      category: input.category,
      withUnread: input.withUnread,
      withBroadcast: input.withBroadcast,
    },
    tx,
  );
}

/** Posts to the single admin account's own announcements room (operator to-do list). */
export async function systemMessageToAdmin(
  input: { content: string; withUnread?: boolean; withBroadcast?: boolean },
  tx?: Tx,
) {
  const admin = await (tx ?? prisma).user.findFirst({
    where: { userType: 'admin', discardedAt: null },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (!admin) {
    logger.warn('systemMessageToAdmin: no admin user exists, dropping message');
    return null;
  }
  return systemMessageToUser(admin.id, input, tx);
}

/**
 * Message#recipients — the other speakers who have not muted the room. Used by
 * the broadcast worker to decide who to notify.
 */
export async function messageRecipients(messageId: number) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversationId: true },
  });
  if (!message) return [];
  return prisma.user.findMany({
    where: {
      id: { not: message.senderId },
      speakers: { some: { conversationId: message.conversationId, ignoring: false } },
    },
    include: { settings: true },
  });
}

/** ConversationsController#show's unread handling, split out for reuse. */
export async function markMessagesRead(
  userId: number,
  messageIds: number[],
): Promise<{ removed: number }> {
  if (!messageIds.length) return { removed: 0 };
  const { count } = await prisma.unreadMessage.deleteMany({
    where: { userId, messageId: { in: messageIds }, ignored: false },
  });
  return { removed: count };
}

export async function unreadCountsByConversation(
  userId: number,
  conversationIds: number[],
): Promise<Record<number, number>> {
  if (!conversationIds.length) return {};
  const rows = await prisma.unreadMessage.groupBy({
    by: ['conversationId'],
    where: { userId, ignored: false, conversationId: { in: conversationIds } },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((row) => [row.conversationId, row._count._all]));
}

export async function totalUnreadCount(userId: number): Promise<number> {
  return prisma.unreadMessage.count({ where: { userId, ignored: false } });
}
