import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { takeWithOverflow } from '@/server/lib/pagination';
import {
  toCastAttendanceDto,
  toConversationSummary,
  toMeetingSummary,
  toMessageDto,
  toUserCard,
  type MeetingRow
} from '@/server/lib/serializers';
import { unreadCountsByConversation } from '@/server/services/messages';
import { enqueueInformRead } from '@/server/jobs/queues';
import { blockedUserIds } from '@/server/services/blockings';
import { activeEventCampaignFor, campaignDailySendCount } from '@/server/services/stickers';
import { hasValidCreditCard, isBookable } from '@/server/services/users';
import { access } from '@/lib';
import { requireUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
import { MESSAGES_PER_PAGE, loadPartnerUser, loadPrivatePartners } from '@/server/api/conversations-shared';
export const dynamic = 'force-dynamic';

/** conversations: GET /conversations/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams, searchParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const query = z.object({ page: z.coerce.number().optional() }).parse(queryObject(searchParams));
  const page = query.page ?? 1;

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { speakers: { include: { user: { include: { castLevel: true, customerLevel: true } } } } },
  });
  const mySpeaker = conversation?.speakers.find((speaker) => speaker.userId === user.id);
  if (!conversation || !mySpeaker) {
    throw new AppError('無効なID', { redirect: '/conversations' });
  }

  // a guest must have a card on file to read a private room
  if (
    conversation.category === 'private' &&
    (user.userType === 'customer' || user.userType === 'inviter') &&
    !hasValidCreditCard(user)
  ) {
    throw new AppError('メッセージを表示する場合、クレジットカードを登録してください', {
      redirect: '/financial/credit_card',
    });
  }

  // one extra row tells the client whether an older page exists
  const rows = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    include: { sender: { select: { id: true, nickName: true, profilePicUrl: true, discardedAt: true } } },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    take: MESSAGES_PER_PAGE + 1,
    skip: (page - 1) * MESSAGES_PER_PAGE,
  });
  const { items, overflow } = takeWithOverflow(rows, MESSAGES_PER_PAGE);
  items.reverse();

  const messageIds = items.map((message) => message.id);
  const wasUnread = new Set<number>();
  const partnerUnreadCounts = new Map<number, number>();
  const ignoredSenders = new Set<number>();

  if (conversation.category === 'system') {
    const unreads = await prisma.unreadMessage.findMany({
      where: { userId: user.id, messageId: { in: messageIds } },
    });
    for (const unread of unreads) if (unread.messageId) wasUnread.add(unread.messageId);
    await prisma.unreadMessage.deleteMany({ where: { id: { in: unreads.map((unread) => unread.id) } } });
  } else {
    const grouped = await prisma.$queryRaw<
      Array<{ message_id: number; unread_count: bigint; unread_by_me: bigint }>
    >(Prisma.sql`
      SELECT message_id,
             COUNT(*) AS unread_count,
             COUNT(CASE WHEN user_id = ${user.id} THEN 1 END) AS unread_by_me
      FROM unread_messages
      WHERE message_id IN (${messageIds.length ? Prisma.join(messageIds) : Prisma.sql`-1`})
      GROUP BY message_id
    `);

    for (const row of grouped) {
      const message = items.find((candidate) => candidate.id === row.message_id);
      if (!message) continue;
      if (message.senderId === user.id) {
        partnerUnreadCounts.set(message.id, Number(row.unread_count));
      } else if (Number(row.unread_by_me) >= 1) {
        wasUnread.add(message.id);
      }
    }

    await prisma.unreadMessage.deleteMany({
      where: { userId: user.id, messageId: { in: messageIds }, ignored: false },
    });
    await enqueueInformRead({
      conversationId: conversation.id,
      readerId: user.id,
      messageIds: [...wasUnread],
    });

    // private rooms are muted wholesale, so only group rooms need per-message filtering
    if (conversation.category !== 'private') {
      const { blockedByMe } = await blockedUserIds(user.id);
      for (const senderId of blockedByMe) ignoredSenders.add(senderId);
    }
  }

  const currentMeeting = await prisma.meeting.findFirst({
    where: { conversationId: conversation.id, status: { in: ['scheduled', 'in_progress'] } },
    include: { area: true, castRank: true, owner: { include: { customerLevel: true } }, castAttendances: true },
    orderBy: { plannedStartTime: 'asc' },
  });

  let disableNewMessages = conversation.category === 'system';
  let partner: Awaited<ReturnType<typeof loadPartnerUser>> = null;
  let myAttendance: ReturnType<typeof toCastAttendanceDto> | null = null;
  let stickers: Array<{
    id: number;
    name: string;
    pictureUrl: string;
    price: number;
    free: boolean;
    eventCampaign: { id: number; name: string; castDailyLimit: number; remainingToday: number } | null;
  }> = [];
  let canOrder = false;
  let canRequestOrder = false;
  let priceSettings: string | null = null;

  if (conversation.category === 'meeting') {
    if (currentMeeting && user.userType === 'cast') {
      const attendance = currentMeeting.castAttendances.find(
        (candidate) => candidate.userId === user.id && candidate.role !== 'out',
      );
      myAttendance = attendance ? toCastAttendanceDto(attendance) : null;
    }
  } else if (conversation.category === 'private') {
    const otherSpeaker = conversation.speakers.find((speaker) => speaker.userId !== user.id);
    partner = otherSpeaker ? await loadPartnerUser(otherSpeaker.userId) : null;

    if (!partner) {
      disableNewMessages = true;
    } else if (user.userType === 'cast' && currentMeeting) {
      const attendance = currentMeeting.castAttendances.find(
        (candidate) => candidate.userId === user.id && candidate.role !== 'out',
      );
      myAttendance = attendance ? toCastAttendanceDto(attendance) : null;
    } else if (user.userType === 'cast' && access(user.accessLevel, 'order')) {
      // a cast may propose an order and hand out event gifts
      canRequestOrder = true;
      priceSettings =
        (
          await prisma.attribute.findFirst({
            where: { userId: user.id, name: '個人料金設定' },
            select: { value: true },
          })
        )?.value ?? '';
      const templates = await prisma.stickerTemplate.findMany({
        where: {
          businessAreaId: user.businessAreaId ?? undefined,
          active: true,
          eventCampaigns: { some: { startAt: { lte: new Date() }, endAt: { gte: new Date() } } },
        },
        orderBy: { price: 'asc' },
      });
      stickers = await Promise.all(
        templates.map(async (template) => {
          const campaign = await activeEventCampaignFor(template.id);
          const sentToday = campaign ? await campaignDailySendCount(campaign, user.id) : 0;
          return {
            id: template.id,
            name: template.name,
            pictureUrl: template.pictureUrl,
            price: template.price,
            free: template.price === 0,
            eventCampaign: campaign
              ? {
                  id: campaign.id,
                  name: campaign.name,
                  castDailyLimit: campaign.castDailyLimit,
                  remainingToday: Math.max(campaign.castDailyLimit - sentToday, 0),
                }
              : null,
          };
        }),
      );
    } else if (user.userType === 'customer' || user.userType === 'inviter' || user.userType === 'admin') {
      canOrder = isBookable(partner);
      if (access(partner.accessLevel, 'receive_stickers')) {
        const templates = await prisma.stickerTemplate.findMany({
          where: { businessAreaId: partner.businessAreaId ?? undefined, active: true, price: { gt: 0 } },
          orderBy: { price: 'asc' },
        });
        stickers = templates.map((template) => ({
          id: template.id,
          name: template.name,
          pictureUrl: template.pictureUrl,
          price: template.price,
          free: false,
          eventCampaign: null,
        }));
      }
    }
  }

  // the roulette shelf is gated on the guest's customer level
  const roulettes =
    user.customerLevelId && partner && access(partner.accessLevel, 'receive_stickers')
      ? await prisma.roulette.findMany({
          where: { active: true, customerLevels: { some: { customerLevelId: user.customerLevelId } } },
          include: { rouletteEntries: { include: { stickerTemplate: true } } },
          orderBy: { sortIndex: 'asc' },
        })
      : [];

  const unreadCounts = await unreadCountsByConversation(user.id, [conversation.id]);
  const partnersMap = await loadPrivatePartners(user, [conversation.id]);

  return {
    conversation: toConversationSummary(conversation, {
      unreadCount: unreadCounts[conversation.id] ?? 0,
      partner: partnersMap.get(conversation.id) ?? null,
      mySpeaker,
      speakerCount: conversation.speakers.length,
    }),
    messages: items.map((message) =>
      toMessageDto(message, {
        viewerId: user.id,
        wasUnread: wasUnread.has(message.id),
        partnerUnreadCount: partnerUnreadCounts.get(message.id) ?? 0,
        ignored: ignoredSenders.has(message.senderId),
      }),
    ),
    overflowMessageId: overflow?.id ?? null,
    page,
    disableNewMessages,
    partner: partner ? toUserCard(partner) : null,
    meeting: currentMeeting ? toMeetingSummary(currentMeeting as unknown as MeetingRow) : null,
    myAttendance,
    stickers,
    roulettes: roulettes.map((roulette) => ({
      id: roulette.id,
      name: roulette.name,
      fee: roulette.fee,
      sortIndex: roulette.sortIndex,
      entries: roulette.rouletteEntries.map((entry) => ({
        id: entry.id,
        stickerTemplateId: entry.stickerTemplateId,
        name: entry.stickerTemplate.name,
        pictureUrl: entry.stickerTemplate.pictureUrl,
        displayChance: entry.displayChance,
        highValue: entry.highValue,
      })),
    })),
    canOrder,
    canRequestOrder,
    priceSettings,
    myRole: mySpeaker.role,
  };
});
