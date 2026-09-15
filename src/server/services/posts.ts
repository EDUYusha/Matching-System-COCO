import { Prisma } from '@prisma/client';
import { config, tokyoStartOfDay } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { formatUserContent } from '@/server/lib/sanitize';
import { parseShrineData, promoteUpload, uploadUrl, type ShrineData } from '@/server/lib/uploads';

/**
 * Ports the Post, PostLike and PostPicture models plus PostsController's queries.
 */

export interface PostIndexRow {
  id: number;
  user_id: number;
  content: string;
  post_likes_count: number;
  category: string;
  liked_by_me: boolean;
  created_at: Date;
  updated_at: Date;
  user_nick_name: string;
  user_type: string;
  user_birthday: Date | null;
  user_birthday_published: number | null;
  user_profile_pic_url: string | null;
  user_discarded_at: Date | null;
}

/**
 * Post.index_query — joins the viewer's own like so the heart renders filled
 * without a second query, and joins users so deleted accounts drop out.
 */
export async function postIndexRows(params: {
  viewerId: number;
  category?: 'public' | 'cast_only';
  userId?: number;
  excludeUserIds?: number[];
  skip: number;
  take: number;
}): Promise<{ rows: PostIndexRow[]; totalCount: number }> {
  const conditions: Prisma.Sql[] = [Prisma.sql`users.discarded_at IS NULL`];
  if (params.category) conditions.push(Prisma.sql`posts.category = ${params.category}::"PostCategory"`);
  if (params.userId) conditions.push(Prisma.sql`posts.user_id = ${params.userId}`);
  if (params.excludeUserIds?.length) {
    conditions.push(Prisma.sql`posts.user_id NOT IN (${Prisma.join(params.excludeUserIds)})`);
  }
  const where = Prisma.join(conditions, ' AND ');

  const rows = await prisma.$queryRaw<PostIndexRow[]>(Prisma.sql`
    SELECT posts.id, posts.user_id, posts.content, posts.post_likes_count, posts.category,
           posts.created_at, posts.updated_at,
           users.nick_name AS user_nick_name, users.user_type AS user_type,
           users.birthday AS user_birthday, users.birthday_published AS user_birthday_published,
           users.profile_pic_url AS user_profile_pic_url, users.discarded_at AS user_discarded_at,
           (my_likes.id IS NOT NULL) AS liked_by_me
    FROM posts
    JOIN users ON users.id = posts.user_id
    LEFT JOIN post_likes my_likes ON my_likes.post_id = posts.id AND my_likes.user_id = ${params.viewerId}
    WHERE ${where}
    ORDER BY posts.created_at DESC
    LIMIT ${params.take} OFFSET ${params.skip}
  `);

  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count FROM posts JOIN users ON users.id = posts.user_id WHERE ${where}
  `);

  return { rows, totalCount: Number(countRows[0]?.count ?? 0) };
}

export interface PostLiker {
  id: number;
  post_id: number;
  nick_name: string;
  profile_pic_url: string | null;
  user_type: string;
  discarded_at: Date | null;
  birthday: Date | null;
  customer_level_id: number | null;
  cast_level_id: number | null;
  no_fame: boolean | null;
}

/**
 * Post.load_users_who_liked — the most recent N likers per post in one query,
 * using a window function as the original did.
 */
export async function loadUsersWhoLiked(postIds: number[]): Promise<Map<number, PostLiker[]>> {
  const result = new Map<number, PostLiker[]>();
  if (!postIds.length) return result;

  const rows = await prisma.$queryRaw<PostLiker[]>(Prisma.sql`
    SELECT outer_users.id, inner_users.post_id, outer_users.nick_name, outer_users.profile_pic_url,
           outer_users.user_type, outer_users.discarded_at, outer_users.birthday,
           outer_users.customer_level_id, outer_users.cast_level_id,
           user_settings.no_fame AS no_fame
    FROM users AS outer_users
    JOIN (
      SELECT users.id, pl.post_id,
             ROW_NUMBER() OVER (PARTITION BY pl.post_id ORDER BY pl.created_at DESC) AS rn
      FROM users
      JOIN post_likes pl ON pl.user_id = users.id
      WHERE pl.post_id IN (${Prisma.join(postIds)})
    ) AS inner_users ON outer_users.id = inner_users.id
      AND inner_users.rn <= ${config.inline_number_of_users_who_liked_posts}
    LEFT JOIN user_settings ON user_settings.user_id = outer_users.id
    ORDER BY inner_users.rn
  `);

  for (const row of rows) {
    const list = result.get(row.post_id) ?? [];
    list.push(row);
    result.set(row.post_id, list);
  }
  return result;
}

/** Post#like! — silently false on a duplicate or self-like, as the model did. */
export async function likePost(postId: number, userId: number): Promise<boolean> {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
  if (!post) return false;
  // PostLike#cant_like_myself
  if (post.userId === userId) return false;
  try {
    await prisma.$transaction(async (t) => {
      await t.postLike.create({ data: { postId, userId } });
      // counter_cache: true
      await t.post.update({ where: { id: postId }, data: { postLikesCount: { increment: 1 } } });
    });
    return true;
  } catch {
    return false;
  }
}

/** Post#unlike! */
export async function unlikePost(postId: number, userId: number): Promise<boolean> {
  const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });
  if (!existing) return false;
  await prisma.$transaction(async (t) => {
    await t.postLike.delete({ where: { id: existing.id } });
    await t.post.update({ where: { id: postId }, data: { postLikesCount: { decrement: 1 } } });
  });
  return true;
}

export interface CreatePostInput {
  userId: number;
  content: string;
  category?: 'public' | 'cast_only';
  pictures?: ShrineData[];
}

export async function createPost(input: CreatePostInput, tx?: Tx) {
  const client = tx ?? prisma;
  const post = await client.post.create({
    data: {
      userId: input.userId,
      // before_create :format_content
      content: formatUserContent(input.content),
      category: input.category ?? 'public',
    },
  });

  for (const picture of input.pictures ?? []) {
    const stored = await promoteUpload(picture);
    await client.postPicture.create({
      data: { postId: post.id, fileData: stored as unknown as Prisma.InputJsonValue },
    });
  }

  return post;
}

export async function destroyPost(postId: number, userId: number): Promise<void> {
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { postPictures: true } });
  if (post.userId !== userId) throw new AppError('権限がありません', { statusCode: 403 });

  for (const picture of post.postPictures) {
    const data = parseShrineData(picture.fileData);
    if (data) {
      const { destroyUpload } = await import('@/server/lib/uploads');
      await destroyUpload(data);
    }
  }
  await prisma.post.delete({ where: { id: postId } });
}

export function postPictureUrls(pictures: Array<{ fileData: unknown }>): string[] {
  return pictures
    .map((picture) => uploadUrl(parseShrineData(picture.fileData)))
    .filter((url): url is string => !!url);
}

/**
 * PostLike.current_like_credits_for_user — the credits a cast has earned today
 * from liking posts, which the timeline shows as a running total.
 *
 * Only likes on posts younger than cast_like_hour_limit count, so a cast cannot
 * farm credits by liking the archive.
 */
export async function currentLikeCreditsForUser(userId: number): Promise<number> {
  const lastTransactionTime = tokyoStartOfDay(new Date(), config.cast_like_day_change);
  const effectiveStart =
    lastTransactionTime.getTime() > Date.now()
      ? new Date(lastTransactionTime.getTime() - 24 * 60 * 60 * 1000)
      : lastTransactionTime;

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM post_likes
    JOIN posts ON posts.id = post_likes.post_id
    WHERE post_likes.user_id = ${userId}
      AND post_likes.created_at > ${effectiveStart}
      AND EXTRACT(EPOCH FROM (post_likes.created_at - posts.created_at)) / 3600 < ${config.cast_like_hour_limit}
  `);

  return Number(rows[0]?.count ?? 0) * config.cast_credits_per_like;
}

/** User#unread_posts — posts since last_post_read_at, excluding the viewer's own. */
export async function unreadPostsCount(user: {
  id: number;
  lastPostReadAt: Date | null;
  userType: string;
}): Promise<number> {
  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  return prisma.post.count({
    where: {
      createdAt: { gt: user.lastPostReadAt ?? new Date(0) },
      userId: { not: user.id },
      user: { discardedAt: null },
      ...(isCast ? {} : { category: 'public' }),
    },
  });
}

/** The newest unread post, so the timeline can scroll to it. */
export async function firstUnreadPost(user: { id: number; lastPostReadAt: Date | null; userType: string }) {
  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  return prisma.post.findFirst({
    where: {
      createdAt: { gt: user.lastPostReadAt ?? new Date(0) },
      userId: { not: user.id },
      user: { discardedAt: null },
      ...(isCast ? {} : { category: 'public' }),
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
}

/**
 * PostsController#index's "biggest gift of the last 8 hours" banner: a sticker
 * transaction of at least 28,000 credits.
 */
export async function largestStickerTransaction() {
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  return prisma.creditTransaction.findFirst({
    where: { category: 'sticker', createdAt: { gte: eightHoursAgo }, chargedAmount: { gte: 28_000 } },
    orderBy: [{ chargedAmount: 'desc' }, { createdAt: 'desc' }],
    include: {
      chargedUser: { select: { id: true, nickName: true, profilePicUrl: true, userType: true, customerLevelId: true, birthday: true, settings: true } },
      creditedUser: { select: { id: true, nickName: true, profilePicUrl: true, userType: true, castLevelId: true, birthday: true, settings: true } },
      stickers: { include: { template: true }, take: 1 },
    },
  });
}
