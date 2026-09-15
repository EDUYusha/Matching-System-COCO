import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { toUserCard } from '@/server/lib/serializers';
import { systemMessageToUser } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** misc: GET /friendships */
export const GET = route(async (_request) => {
  const user = await requireUser();

  const [friendships, requests] = await Promise.all([
    prisma.friendship.findMany({
      where: { userId: user.id },
      include: { friend: { include: { castLevel: true, customerLevel: true } } },
    }),
    // friendship_requests: incoming, with no counterpart from me yet
    prisma.friendship.findMany({
      where: {
        friendId: user.id,
        NOT: { user: { friendships: { some: { friendId: user.id } } } },
      },
      include: { user: { include: { castLevel: true, customerLevel: true } } },
    }),
  ]);

  return {
    friendships: friendships.map((friendship) => ({
      id: friendship.id,
      mutual: friendship.mutual,
      status: friendship.status,
      friend: toUserCard(friendship.friend),
    })),
    requests: requests.map((friendship) => ({
      id: friendship.id,
      mutual: friendship.mutual,
      status: friendship.status,
      user: toUserCard(friendship.user),
    })),
  };
});

/** misc: POST /friendships */
export const POST = route(async (request) => {
      const user = await requireUser();
      const body = z
        .object({ inviterCode: z.string(), contactMessage: z.string().optional().nullable() })
        .parse(await jsonBody(request));

      const { decodeInvitationCode } = await import('@/server/lib/invitation-code');
      const friendId = decodeInvitationCode(body.inviterCode);
      const friend = friendId ? await prisma.user.findFirst({ where: { id: friendId, discardedAt: null } }) : null;

      if (!friend) throw new AppError('この紹介者コードのユーザーがありません。', { statusCode: 422 });
      if (friend.id === user.id) throw new AppError('自分と友達になれません。', { statusCode: 422 });

      const existing = await prisma.friendship.findUnique({
        where: { userId_friendId: { userId: user.id, friendId: friend.id } },
      });
      if (existing) throw new AppError('すでに友達申請を送っています。', { statusCode: 422 });

      await prisma.friendship.create({ data: { userId: user.id, friendId: friend.id } });

      await systemMessageToUser(friend.id, {
        withBroadcast: true,
        withUnread: true,
        content: `${user.nickName}さんから友達申請が届きました。
  友達になる場合は<a href="/friendships">お友達画面</a>で友達申請を承認してください。
  ${body.contactMessage?.trim() ? `下記のメッセージが届いております。\n「${body.contactMessage}」` : ''}
  `,
      });

      return { ok: true, redirect: '/friendships', flash: { type: 'notice', message: '友達申請を送りました。' } };
});
