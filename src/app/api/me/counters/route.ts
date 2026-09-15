import { config } from '@/lib';
import type { NavCounters } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { availableForWhere } from '@/server/services/meetings/model';
import { totalUnreadCount } from '@/server/services/messages';
import { unreadPostsCount } from '@/server/services/posts';
import { isAvailable } from '@/server/services/users';
import { serviceMessagesFor } from '@/server/services/service-messages';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: GET /me/counters */
export const GET = route(async (_request): Promise<Promise<NavCounters>> => {
  const user = await requireUser();

  const unreadMessagesCount = await totalUnreadCount(user.id);

  let availability = false;
  let availableMeetingsCount = 0;
  if (isAvailable(user) || config.cast_always_receive_meeting_notifications) {
    availability = true;

    const [blockedByMe, blockingMe] = await Promise.all([
      prisma.blocking.findMany({ where: { userId: user.id }, select: { targetId: true } }),
      prisma.blocking.findMany({ where: { targetId: user.id }, select: { userId: true } }),
    ]);
    const blockedIds = [
      ...blockedByMe.map((row) => row.targetId),
      ...blockingMe.map((row) => row.userId),
    ];

    const where = availableForWhere(user, { blockedIds });
    if (where) {
      availableMeetingsCount = await prisma.meeting.count({
        where: { ...where, status: { in: ['requested', 'cast_selectable'] } },
      });
    }
  }

  const unreadPosts = config.show_unread_posts_count ? await unreadPostsCount(user) : 0;

  const serviceMessages = await serviceMessagesFor(user, {
    unreadOnly: true,
    since: user.lastServiceMessageReadAt,
  });

  return {
    unreadMessagesCount,
    unreadPostsCount: unreadPosts,
    unreadServiceMessagesCount: serviceMessages.length,
    availableMeetingsCount,
    availability,
  };
});
