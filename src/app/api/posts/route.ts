import { z } from 'zod';
import type { ShrineData } from '@/server/lib/uploads';
import { promoteUpload, storeUpload } from '@/server/lib/uploads';
import { AppError } from '@/server/lib/errors';
import { createPost } from '@/server/services/posts';
import { requireGate } from '@/server/auth/session';
import { multipart } from '@/server/http/multipart';
import { ageFromBirthday, config } from '@/lib';
import type { PostDto } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { blockedUserIds } from '@/server/services/blockings';
import {
  currentLikeCreditsForUser,
  firstUnreadPost,
  largestStickerTransaction,
  loadUsersWhoLiked,
  postIndexRows,
  postPictureUrls
} from '@/server/services/posts';
import { toUserCard } from '@/server/lib/serializers';
import { jsonBody, queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: GET /posts */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireGate('post');
  const query = z
    .object({ cast_only: z.string().optional(), page: z.coerce.number().optional() })
    .parse(queryObject(searchParams));
  const page = query.page ?? 1;
  const pagination = paginationArgs(page, 25);

  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  const category = query.cast_only !== undefined && isCast ? 'cast_only' : 'public';

  const { blockedByMe, blockingMe } = await blockedUserIds(user.id);

  const { rows, totalCount } = await postIndexRows({
    viewerId: user.id,
    category,
    excludeUserIds: [...new Set([...blockedByMe, ...blockingMe])],
    ...pagination,
  });

  const postIds = rows.map((row) => row.id);
  const [pictures, likers] = await Promise.all([
    postIds.length ? prisma.postPicture.findMany({ where: { postId: { in: postIds } } }) : [],
    config.show_users_who_liked_posts
      ? loadUsersWhoLiked(postIds)
      : new Map<number, Awaited<ReturnType<typeof loadUsersWhoLiked>> extends Map<number, infer V> ? V : never>(),
  ]);

  const items: PostDto[] = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    content: row.content,
    category: row.category as 'public' | 'cast_only',
    postLikesCount: row.post_likes_count,
    likedByMe: row.liked_by_me,
    createdAt: row.created_at.toISOString(),
    user: {
      id: row.user_id,
      nickName: row.user_discarded_at ? '[削除]' : row.user_nick_name,
      userType: row.user_type as never,
      profilePicUrl: row.user_discarded_at
        ? '/system/profile-pic-discarded.png'
        : row.user_profile_pic_url || '/system/noimage.png',
      age: row.user_birthday_published ? ageFromBirthday(row.user_birthday) : null,
      birthdayPublished: !!row.user_birthday_published,
      discarded: !!row.user_discarded_at,
    },
    pictures: postPictureUrls(pictures.filter((picture) => picture.postId === row.id)),
    usersWhoLiked: (likers.get(row.id) ?? []).map((liker) => ({
      id: liker.id,
      nickName: liker.no_fame ? '匿名' : liker.nick_name,
      // PostsHelper#donor_profile_pic_url hides the face for anonymous donors
      profilePicUrl: liker.no_fame
        ? liker.user_type === 'cast'
          ? '/system/face_sample_cast.png'
          : '/system/face_sample_customer.png'
        : liker.profile_pic_url || '/system/noimage.png',
      userType: liker.user_type as never,
      levelName: null,
      age: liker.no_fame ? null : ageFromBirthday(liker.birthday),
      anonymous: !!liker.no_fame,
    })),
    isMine: row.user_id === user.id,
  }));

  // the cast-facing "long absent guests" strip
  const customerDaysElapsed = isCast
    ? await prisma.user.findMany({
        where: {
          userType: 'customer',
          discardedAt: null,
          daysElapsed: { gte: config.customer_days_elapsed },
          lastLogin: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        include: { customerLevel: true },
        take: 40,
      })
    : [];

  const unreadAnchor = config.show_unread_posts_count ? await firstUnreadPost(user) : null;
  const biggestGift = await largestStickerTransaction();

  return {
    ...paginate(items, totalCount, page, 25),
    category,
    customerDaysElapsed: customerDaysElapsed.map((candidate) =>
      toUserCard(candidate, { showDaysElapsed: true }),
    ),
    firstUnreadPostId: unreadAnchor?.id ?? null,
    currentLikeCredits: await currentLikeCreditsForUser(user.id),
    biggestGift: biggestGift
      ? {
          chargedAmount: biggestGift.chargedAmount ?? 0,
          createdAt: biggestGift.createdAt.toISOString(),
          donor: biggestGift.chargedUser
            ? {
                id: biggestGift.chargedUser.id,
                nickName: biggestGift.chargedUser.settings?.noFame
                  ? '匿名'
                  : biggestGift.chargedUser.nickName,
                profilePicUrl: biggestGift.chargedUser.settings?.noFame
                  ? '/system/face_sample_customer.png'
                  : biggestGift.chargedUser.profilePicUrl || '/system/noimage.png',
                anonymous: !!biggestGift.chargedUser.settings?.noFame,
              }
            : null,
          recipient: biggestGift.creditedUser
            ? {
                id: biggestGift.creditedUser.id,
                nickName: biggestGift.creditedUser.nickName,
                profilePicUrl: biggestGift.creditedUser.profilePicUrl || '/system/noimage.png',
              }
            : null,
          sticker: biggestGift.stickers[0]
            ? {
                name: biggestGift.stickers[0].template.name,
                pictureUrl: biggestGift.stickers[0].template.pictureUrl,
              }
            : null,
        }
      : null,
  };
});

/**
 * PostsController#create.
 *
 * Accepts either a multipart submission (text plus up to a few pictures) or a
 * plain JSON body, which is what the original checked `request.isMultipart?` for.
 */
export const POST = route(async (request) => {
  const user = await requireGate('post');

  let content = '';
  let category: 'public' | 'cast_only' = 'public';
  const pictures: ShrineData[] = [];

  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const { files, fields } = await multipart(request);
    for (const file of files) {
      pictures.push(await storeUpload(file.file, { filename: file.filename, mimeType: file.mimetype }));
    }
    content = fields.content ?? '';
    category = fields.category === 'cast_only' ? 'cast_only' : 'public';
  } else {
    const payload = z
      .object({ content: z.string(), category: z.enum(['public', 'cast_only']).optional() })
      .parse(await jsonBody(request));
    content = payload.content;
    category = payload.category ?? 'public';
  }

  if (!content.trim() && !pictures.length) throw new AppError('内容を入力してください');

  // only cast may post to the cast-only stream
  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  if (!isCast) category = 'public';

  const promoted = await Promise.all(pictures.map((picture) => promoteUpload(picture)));
  const post = await createPost({ userId: user.id, content, category, pictures: promoted });

  return {
    ok: true,
    postId: post.id,
    redirect: category === 'cast_only' ? '/posts?cast_only' : '/posts',
  };
});
