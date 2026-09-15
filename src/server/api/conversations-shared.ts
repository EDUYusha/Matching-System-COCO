import { prisma } from '@/server/lib/prisma';
/**
 * Shared by the conversations route handlers: the schemas and query helpers
 * the original conversations.ts declared once and used from several actions.
 */

/**
 * Port of ConversationsController: the chat list, the thread view with its unread
 * bookkeeping, and the per-room decisions about which extra controls to show.
 */

export const PER_PAGE = 10;

export const MESSAGES_PER_PAGE = 25;

/**
 * ConversationsController#load_private_partners. Operators and admins see the
 * customer's name as the room title too, so their rooms are treated as private.
 */
export async function loadPrivatePartners(
  user: { id: number; userType: string },
  conversationIds: number[],
): Promise<Map<number, { id: number; nickName: string; profilePicUrl: string }>> {
  const result = new Map<number, { id: number; nickName: string; profilePicUrl: string }>();
  if (!conversationIds.length) return result;

  const categories: Array<'private' | 'admin' | 'operator'> = ['private'];
  if (user.userType === 'admin') categories.push('admin');
  if (user.userType === 'admin' || user.userType === 'operator') categories.push('operator');

  const speakers = await prisma.speaker.findMany({
    where: {
      conversationId: { in: conversationIds },
      userId: { not: user.id },
      conversation: { category: { in: categories } },
    },
    include: { user: { select: { id: true, nickName: true, profilePicUrl: true, discardedAt: true } } },
  });

  for (const speaker of speakers) {
    result.set(speaker.conversationId, {
      id: speaker.user.id,
      nickName: speaker.user.discardedAt ? '[削除]' : speaker.user.nickName,
      profilePicUrl: speaker.user.discardedAt
        ? '/system/profile-pic-discarded.png'
        : speaker.user.profilePicUrl || '/system/noimage.png',
    });
  }
  return result;
}

export async function loadPartnerUser(userId: number) {
  return prisma.user.findFirst({
    where: { id: userId },
    include: { castLevel: true, customerLevel: true, userAttributes: { select: { name: true, value: true } } },
  });
}
