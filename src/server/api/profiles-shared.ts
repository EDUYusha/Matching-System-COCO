import { chatAccess, config, publicProfileAccess } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { toProfileDetail, toUserCard } from '@/server/lib/serializers';
import { attributeEntries } from '@/server/services/users';
import { postIndexRows, postPictureUrls } from '@/server/services/posts';
import { findConversationWithPartner } from '@/server/services/conversations';
import { sendSnsMessage, lineDeepLink } from '@/server/services/notifications';
import { env } from '@/server/config/env';
/**
 * Shared by the profiles route handlers: the schemas and query helpers
 * the original profiles.ts declared once and used from several actions.
 */

/** ProfilesController#show_me and #show share `shared_show`. */
export async function buildProfile(viewerId: number, profileUserId: number) {
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: viewerId } });
  const profileUser = await prisma.user.findFirst({
    where: { id: profileUserId, discardedAt: null },
    include: {
      castLevel: true,
      customerLevel: true,
      userAttributes: { select: { name: true, value: true } },
    },
  });
  if (!profileUser) {
    throw new AppError('プロファイルは公開ではありません', { redirect: '/profiles/search' });
  }

  const isMe = viewer.id === profileUser.id;

  if (!isMe) {
    if (!profileUser.publicProfile) {
      throw new AppError('プロファイルは公開ではありません', { redirect: '/profiles/search' });
    }
    const friendOf = config.friends_functionality
      ? !!(await prisma.friendship.findFirst({
          where: { userId: profileUser.id, friendId: viewer.id, mutual: true },
        }))
      : false;
    if (!publicProfileAccess(viewer, profileUser) && !friendOf) {
      throw new ForbiddenError('権利がありません', '/profiles/search');
    }
    // a user who blocked me must not be visible to me
    const blockedMe = await prisma.blocking.findFirst({
      where: { userId: profileUser.id, targetId: viewer.id },
    });
    if (blockedMe) throw new ForbiddenError('権利がありません', '/profiles/search');
  }

  const [pictures, entries, allPreferences, myPreferences, stickerCounts, trophies] = await Promise.all([
    prisma.picture.findMany({
      where: { userId: profileUser.id, public: true },
      orderBy: { profilePic: 'desc' },
    }),
    attributeEntries(profileUser.id, profileUser.userType, { missing: isMe }),
    prisma.meetingPreferencesSchema.findMany({ where: { active: true }, orderBy: { sortIndex: 'asc' } }),
    prisma.meetingPreference.findMany({ where: { userId: profileUser.id }, select: { parentId: true } }),
    prisma.sticker.groupBy({
      by: ['stickerTemplateId'],
      where: { userId: profileUser.id },
      _count: { _all: true },
    }),
    prisma.userTrophy.findMany({ where: { userId: profileUser.id }, include: { trophy: true } }),
  ]);

  const templates = await prisma.stickerTemplate.findMany({
    where: { id: { in: stickerCounts.map((row) => row.stickerTemplateId) } },
  });

  const reviewStats = config.show_review_summary_on_profile
    ? await prisma.review.aggregate({
        where: { revieweeId: profileUser.id },
        _avg: { stars: true },
        _count: { _all: true },
      })
    : null;

  const posts = config.show_posts_on_profile
    ? await postIndexRows({
        viewerId: viewer.id,
        userId: profileUser.id,
        category: 'public',
        skip: 0,
        take: 10,
      })
    : { rows: [], totalCount: 0 };

  const postPictures = posts.rows.length
    ? await prisma.postPicture.findMany({ where: { postId: { in: posts.rows.map((row) => row.id) } } })
    : [];

  const acquaintanceConversationId = isMe
    ? null
    : await findConversationWithPartner(viewer.id, profileUser.id, {
        onlyPrivate: true,
        includeIgnored: true,
      });

  const memo = isMe
    ? null
    : (await prisma.userMemo.findUnique({
        where: { targetId_userId: { targetId: profileUser.id, userId: viewer.id } },
      }))?.content ?? null;

  const favorited = isMe
    ? false
    : !!(await prisma.favorite.findUnique({
        where: { userId_targetId: { userId: viewer.id, targetId: profileUser.id } },
      }));

  const blockedByMe = isMe
    ? false
    : !!(await prisma.blocking.findUnique({
        where: { targetId_userId: { targetId: profileUser.id, userId: viewer.id } },
      }));

  const priceSettings =
    profileUser.userAttributes.find((attribute) => attribute.name === '個人料金設定')?.value ?? null;

  const attributeGroups = groupAttributes(entries);
  const myPreferenceIds = new Set(myPreferences.map((preference) => preference.parentId));

  return toProfileDetail(profileUser, {
    attributes: profileUser.userAttributes,
    favorited,
    pictures,
    attributeGroups,
    meetingPreferences: allPreferences.map((preference) => ({
      id: preference.id,
      name: preference.name,
      category: preference.category,
      subcategory: preference.subcategory,
      score: preference.score,
      selected: myPreferenceIds.has(preference.id),
    })),
    stickers: stickerCounts.map((row) => {
      const template = templates.find((candidate) => candidate.id === row.stickerTemplateId);
      return {
        stickerTemplateId: row.stickerTemplateId,
        name: template?.name ?? '',
        pictureUrl: template?.pictureUrl ?? '',
        count: row._count._all,
      };
    }),
    trophies: trophies.map((link) => ({
      id: link.trophy.id,
      name: link.trophy.name,
      imageUrl: link.trophy.imageUrl,
      description: link.trophy.description,
    })),
    posts: posts.rows.map((row) => ({
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
        profilePicUrl: row.user_profile_pic_url || '/system/noimage.png',
        age: null,
        birthdayPublished: !!row.user_birthday_published,
        discarded: !!row.user_discarded_at,
      },
      pictures: postPictureUrls(postPictures.filter((picture) => picture.postId === row.id)),
      usersWhoLiked: [],
      isMine: row.user_id === viewer.id,
    })),
    reviewStats:
      reviewStats && reviewStats._count._all > 0
        ? { average: reviewStats._avg.stars ?? 0, count: reviewStats._count._all }
        : null,
    acquaintanceConversationId,
    memo,
    isMe,
    canChat: !isMe && chatAccess(viewer, profileUser),
    blockedByMe,
    priceSettings,
  });
}

/** ProfilesController#make_footprint, including the LINE notification. */
export async function makeFootprint(viewerId: number, profileUserId: number): Promise<void> {
  if (viewerId === profileUserId) return;

  const [viewer, profileUser] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: viewerId } }),
    prisma.user.findUniqueOrThrow({ where: { id: profileUserId }, include: { settings: true } }),
  ]);

  if (viewer.userType === 'cast' && profileUser.userType === 'cast') return;
  // no footprints from test accounts
  if (viewer.inviterId === 1) return;

  // at most one footprint per pair per day (the original's comment says 1 hour,
  // the code says 24 — the code wins)
  const recent = await prisma.footprint.findFirst({
    where: {
      userId: viewerId,
      profileUserId,
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent) return;

  await prisma.footprint.create({ data: { userId: viewerId, profileUserId } });

  if (profileUser.snsId && profileUser.settings?.footprintNotification) {
    await sendSnsMessage({
      recipients: { id: profileUser.id, snsId: profileUser.snsId },
      template: 'sns_templates/rich_message.ruby',
      templateData: {
        title: `${viewer.nickName}さんから足跡が付きました。`,
        text: '早速プロフィールをみてみましょう！\n※足跡の通知OFFはマイページより',
        image_url: env.hostPrefix + (viewer.profilePicUrl || '/system/noimage.png'),
        button_text: 'プロフィールを見る',
        url: lineDeepLink(`/profiles/${viewer.id}`),
      },
    }).catch(() => undefined);
  }
}

/** AttributesSchema::CATEGORY_SORT_ORDER */
export const CATEGORY_SORT_ORDER = ['基本情報', '外見', 'お話', '性格', '好みのタイプ'];

export function groupAttributes(entries: Awaited<ReturnType<typeof attributeEntries>>) {
  const byCategory = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }
  return [...byCategory.entries()]
    .sort((a, b) => {
      const ai = CATEGORY_SORT_ORDER.indexOf(a[0]);
      const bi = CATEGORY_SORT_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(([category, list]) => ({ category, entries: list }));
}

export async function loadHighlightings(lookupUserTypes: string[] | null) {
  const highlightings = await prisma.highlighting.findMany({
    where: {
      active: true,
      OR: [{ userType: 'all' }, ...(lookupUserTypes ? [{ userType: { in: lookupUserTypes } }] : [])],
    },
    orderBy: { sortIndex: 'asc' },
    include: {
      userHighlightings: {
        include: { user: { include: { castLevel: true, customerLevel: true } } },
        orderBy: { id: 'desc' },
      },
    },
  });

  return highlightings.map((highlighting) => ({
    id: highlighting.id,
    categoryName: highlighting.categoryName,
    note: highlighting.note,
    entries: highlighting.userHighlightings.map((entry) => ({
      id: entry.id,
      content: entry.content,
      user: toUserCard(entry.user),
    })),
  }));
}
