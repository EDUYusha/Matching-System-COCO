import type { ServiceMessageDto } from '@/lib';
import { prisma } from '@/server/lib/prisma';

/**
 * Port of the ServiceMessage model and ServiceMessagesController.
 *
 * Announcements are targeted by audience flags plus, for cast, an optional
 * branch. Read state is a single high-water mark on the user
 * (last_service_message_read_at) rather than per-message rows.
 */

export const SERVICE_MESSAGES_PAGE_SIZE = 3;

/** ServiceMessage.for(user) */
export async function serviceMessagesFor(
  user: { userType: string; businessAreaId: number | null; lastServiceMessageReadAt?: Date | null },
  options: { unreadOnly?: boolean; since?: Date | null; skip?: number; take?: number } = {},
) {
  const audience =
    user.userType === 'cast'
      ? {
          forCast: true,
          active: true,
          OR: [{ businessAreaId: null }, { businessAreaId: user.businessAreaId }],
        }
      : user.userType === 'customer'
        ? { forCustomers: true, active: true }
        : user.userType === 'inviter'
          ? { forInviters: true, active: true }
          : { active: true };

  return prisma.serviceMessage.findMany({
    where: {
      ...audience,
      ...(options.unreadOnly ? { createdAt: { gt: options.since ?? new Date(0) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    ...(options.skip !== undefined ? { skip: options.skip } : {}),
    ...(options.take !== undefined ? { take: options.take } : {}),
  });
}

export function toServiceMessageDto(
  message: { id: number; title: string | null; content: string | null; createdAt: Date },
  lastReadAt: Date | null,
): ServiceMessageDto {
  return {
    id: message.id,
    title: message.title,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    // ServiceMessage#unread_by?
    unread: lastReadAt === null || lastReadAt.getTime() < message.createdAt.getTime(),
  };
}
