import { prisma } from '@/server/lib/prisma';
import { findConversationWithPartner } from '@/server/services/conversations';

/**
 * Port of the Blocking model's `with_cleaning` callbacks.
 *
 * Blocking does three things beyond creating the row, per the model's own comment:
 *   1) mute the shared private room so it drops out of the blocker's chat list
 *   2) mark unread messages from the blocked user as ignored, now and in future
 *   3) mark unread messages inside that room ignored, which covers the system
 *      messages the blocked user's actions generate
 */

export async function createBlocking(userId: number, targetId: number): Promise<void> {
  await prisma.$transaction(async (t) => {
    await t.blocking.create({ data: { userId, targetId } });

    // (2) everything this user ever sent me
    await t.unreadMessage.updateMany({
      where: { userId, message: { senderId: targetId } },
      data: { ignored: true },
    });

    const conversationId = await findConversationWithPartner(userId, targetId, {
      onlyPrivate: true,
      includeIgnored: true,
    });
    if (conversationId) {
      // (1) hide the room
      await t.speaker.updateMany({ where: { conversationId, userId }, data: { ignoring: true } });
      // (3) and everything unread inside it
      await t.unreadMessage.updateMany({ where: { userId, conversationId }, data: { ignored: true } });
    }
  });
}

export async function destroyBlocking(blockingId: number): Promise<void> {
  const blocking = await prisma.blocking.findUniqueOrThrow({ where: { id: blockingId } });

  await prisma.$transaction(async (t) => {
    await t.unreadMessage.updateMany({
      where: { userId: blocking.userId, message: { senderId: blocking.targetId } },
      data: { ignored: false },
    });

    const conversationId = await findConversationWithPartner(blocking.userId, blocking.targetId, {
      onlyPrivate: true,
      includeIgnored: true,
    });
    if (conversationId) {
      await t.speaker.updateMany({
        where: { conversationId, userId: blocking.userId },
        data: { ignoring: false },
      });
      await t.unreadMessage.updateMany({
        where: { userId: blocking.userId, conversationId },
        data: { ignored: false },
      });
    }

    await t.blocking.delete({ where: { id: blocking.id } });
  });
}

/** The ids a viewer should not see content from, in both directions. */
export async function blockedUserIds(userId: number): Promise<{ blockedByMe: number[]; blockingMe: number[] }> {
  const [blockedByMe, blockingMe] = await Promise.all([
    prisma.blocking.findMany({ where: { userId }, select: { targetId: true } }),
    prisma.blocking.findMany({ where: { targetId: userId }, select: { userId: true } }),
  ]);
  return {
    blockedByMe: blockedByMe.map((row) => row.targetId),
    blockingMe: blockingMe.map((row) => row.userId),
  };
}
