import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ageFromBirthday, config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: GET /posts/:id/users_who_liked */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  if (!config.show_users_who_liked_posts) return new NextResponse(null, { status: 404 });

  const post = await prisma.post.findUniqueOrThrow({ where: { id: params.id } });
  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  if (post.category === 'cast_only' && !isCast) return new NextResponse(null, { status: 403 });

  const likes = await prisma.postLike.findMany({
    where: { postId: post.id },
    include: {
      user: { include: { castLevel: true, customerLevel: true, settings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    users: likes.map((like) => {
      const anonymous = !!like.user.settings?.noFame && !['admin', 'operator'].includes(user.userType);
      return {
        id: like.user.id,
        nickName: anonymous ? '匿名' : like.user.nickName,
        profilePicUrl: anonymous
          ? like.user.userType === 'cast'
            ? '/system/face_sample_cast.png'
            : '/system/face_sample_customer.png'
          : like.user.profilePicUrl || '/system/noimage.png',
        userType: like.user.userType,
        levelName: anonymous
          ? null
          : (like.user.userType === 'cast' ? like.user.castLevel?.name : like.user.customerLevel?.name) ?? null,
        age: anonymous ? null : ageFromBirthday(like.user.birthday),
        anonymous,
      };
    }),
  };
});
