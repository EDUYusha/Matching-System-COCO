import { idiv, numberToCredits, tokyoStartOfDay } from '@/lib';
import type { StickerTemplate } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { InteractorFailure } from '@/server/lib/errors';
import { createCreditTransaction } from '@/server/services/credits';
import { createMessage, createSystemMessage } from '@/server/services/messages';
import { findConversationWithPartner, findOrCreateSystemConversation } from '@/server/services/conversations';
import { prepareStickerFinances } from '@/server/services/meetings/finances';

/**
 * Ports the gift (sticker) interactors: GiveSticker, PurchaseSticker,
 * CreateStickerTransactions, PurchaseEventGift, CheckEventGiftDailyLimit,
 * CreateEventGiftReward, and the roulette in StickersController.
 *
 * Two kinds of gift exist, and they flow in opposite directions:
 *   paid gifts  — a guest buys one for a cast; the cast earns `revenue`
 *   free gifts  — a cast hands one to a guest during an event campaign; the
 *                 *cast* earns the campaign's reward
 */

/** StickerTemplate#revenue — the cast's cut, absolute or permille of price. */
export function stickerRevenue(template: Pick<StickerTemplate, 'price' | 'transactionPriceAbs' | 'transactionPricePermille'>): number {
  if (template.transactionPriceAbs !== null) return template.transactionPriceAbs;
  if (template.transactionPricePermille !== null) return idiv(template.price * template.transactionPricePermille, 1000);
  throw new Error('StickerTemplate is invalid');
}

export function isFreeSticker(template: Pick<StickerTemplate, 'price'>): boolean {
  return template.price === 0;
}

/** GiveSticker#sticker_content — the chat bubble markup. */
export function stickerContent(template: Pick<StickerTemplate, 'pictureUrl' | 'name' | 'price'>): string {
  let content =
    `<img src="${template.pictureUrl}" class="sticker_message_img">` +
    `<div class="sticker_message_title_text">${template.name}</div>`;
  if (!isFreeSticker(template)) {
    content += `<div class="sticker_message_text">${numberToCredits(template.price)}</div>`;
  }
  return content;
}

/** GiveSticker#review_sticker_content — badge handed out with a review. */
export function reviewStickerContent(
  template: Pick<StickerTemplate, 'pictureUrl' | 'name'>,
  buyer: { id: number; nickName: string },
): string {
  return (
    `<img src="${template.pictureUrl}" class="sticker_message_img">` +
    `<div class="sticker_message_title_text">${template.name}</div>` +
    `<div class="sticker_message_text"><a href="/profiles/${buyer.id}">${buyer.nickName}さん</a>からバッジが届きました！</div>`
  );
}

export interface GiveStickerInput {
  buyerId: number;
  recipientId: number;
  templateId: number;
  conversationId?: number | null;
  /** set when the gift accompanies a post-order review */
  reviewId?: number | null;
  /** pre-built transaction (the roulette pays before handing the prize over) */
  creditTransactionId?: number | null;
}

export interface GiveStickerResult {
  stickerId: number;
  messageId: number;
}

/** GiveSticker */
export async function giveSticker(input: GiveStickerInput, tx?: Tx): Promise<GiveStickerResult> {
  const client = tx ?? prisma;

  const [buyer, recipient, template] = await Promise.all([
    client.user.findUniqueOrThrow({ where: { id: input.buyerId } }),
    client.user.findUniqueOrThrow({ where: { id: input.recipientId } }),
    client.stickerTemplate.findUniqueOrThrow({ where: { id: input.templateId } }),
  ]);

  const review = input.reviewId
    ? await client.review.findUnique({
        where: { id: input.reviewId },
        include: { meeting: { select: { ownerId: true } } },
      })
    : null;

  let conversationId: number | null = input.conversationId ?? null;
  if (!conversationId) {
    if (review?.meeting) {
      conversationId = await findOrCreateSystemConversation(review.meeting.ownerId, tx);
    } else {
      conversationId = await findConversationWithPartner(buyer.id, recipient.id, {
        onlyPrivate: true,
        includeIgnored: true,
      });
    }
  }
  if (!conversationId) throw new InteractorFailure("Couldn't find shared conversations");

  const free = isFreeSticker(template);
  const buyerIsCast = buyer.userType === 'cast';
  const buyerCanCustomer =
    buyer.userType === 'customer' ||
    buyer.userType === 'inviter' ||
    buyer.userType === 'operator' ||
    buyer.userType === 'admin' ||
    buyer.userType === 'system';

  if (free && !buyerIsCast) throw new InteractorFailure('Only cast can send free stickers');
  if (!free && !buyerCanCustomer) throw new InteractorFailure('Only customers can send non-free stickers');
  if (review && !buyerIsCast) throw new InteractorFailure('Only cast can send stickers after meeting');

  return transaction(tx, async (t) => {
    const message = review
      ? await createSystemMessage(
          {
            conversationId: conversationId!,
            category: 'sticker',
            content: reviewStickerContent(template, buyer),
            withUnread: true,
            withBroadcast: true,
          },
          t,
        )
      : await createMessage(
          {
            conversationId: conversationId!,
            senderId: buyer.id,
            category: 'sticker',
            content: stickerContent(template),
            withUnread: true,
            withBroadcast: true,
            withoutFormat: true,
          },
          t,
        );

    const sticker = await t.sticker.create({
      data: {
        userId: recipient.id,
        buyerId: buyer.id,
        stickerTemplateId: template.id,
        messageId: message.id,
        ...(input.creditTransactionId ? { creditTransactionId: input.creditTransactionId } : {}),
      },
    });

    if (review) {
      await t.review.update({ where: { id: review.id }, data: { stickerId: sticker.id } });
    }

    return { stickerId: sticker.id, messageId: message.id };
  });
}

/** CreateStickerTransactions */
export async function createStickerTransactions(stickerId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const sticker = await client.sticker.findUniqueOrThrow({
    where: { id: stickerId },
    include: { template: true },
  });

  const ct = await createCreditTransaction(
    {
      chargedAmount: sticker.template.price,
      chargedUserId: sticker.buyerId,
      creditedAmount: stickerRevenue(sticker.template),
      creditedUserId: sticker.userId,
      reason: 'ギフトプレゼント',
      category: 'sticker',
      withBalanceUpdates: true,
    },
    tx,
  );

  await client.sticker.update({ where: { id: sticker.id }, data: { creditTransactionId: ct.id } });
}

/** PurchaseSticker — PrepareStickerFinances, GiveSticker, CreateStickerTransactions. */
export async function purchaseSticker(input: {
  buyerId: number;
  recipientId: number;
  templateId: number;
  conversationId?: number | null;
}): Promise<GiveStickerResult> {
  const template = await prisma.stickerTemplate.findUniqueOrThrow({ where: { id: input.templateId } });

  await prepareStickerFinances({
    buyerId: input.buyerId,
    recipientId: input.recipientId,
    price: template.price,
  });

  const result = await giveSticker(input);
  await createStickerTransactions(result.stickerId);
  return result;
}

// --- event campaign gifts (キャストチョコ) ---------------------------------

/** EventCampaign.active */
export async function activeEventCampaignFor(templateId: number, tx?: Tx) {
  const client = tx ?? prisma;
  const now = new Date();
  return client.eventCampaign.findFirst({
    where: { stickerTemplateId: templateId, startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { startAt: 'desc' },
  });
}

/** The overlap of "today in Tokyo" with the campaign window. */
function campaignTodayRange(campaign: { startAt: Date; endAt: Date }): { start: Date; end: Date } | null {
  const dayStart = tokyoStartOfDay(new Date());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const start = new Date(Math.max(dayStart.getTime(), campaign.startAt.getTime()));
  const end = new Date(Math.min(dayEnd.getTime(), campaign.endAt.getTime()));
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

/** EventCampaign#daily_send_count_for */
export async function campaignDailySendCount(
  campaign: { startAt: Date; endAt: Date; stickerTemplateId: number },
  castUserId: number,
  tx?: Tx,
): Promise<number> {
  const range = campaignTodayRange(campaign);
  if (!range) return 0;
  const client = tx ?? prisma;
  return client.sticker.count({
    where: {
      buyerId: castUserId,
      stickerTemplateId: campaign.stickerTemplateId,
      createdAt: { gte: range.start, lte: range.end },
    },
  });
}

/** EventCampaign#total_send_count_for */
export async function campaignTotalSendCount(
  campaign: { startAt: Date; endAt: Date; stickerTemplateId: number },
  castUserId: number,
  tx?: Tx,
): Promise<number> {
  const client = tx ?? prisma;
  return client.sticker.count({
    where: {
      buyerId: castUserId,
      stickerTemplateId: campaign.stickerTemplateId,
      createdAt: { gte: campaign.startAt, lte: campaign.endAt },
    },
  });
}

/** EventCampaign#already_sent_to_recipient_today? */
export async function campaignAlreadySentToRecipientToday(
  campaign: { startAt: Date; endAt: Date; stickerTemplateId: number },
  castUserId: number,
  recipientId: number,
  tx?: Tx,
): Promise<boolean> {
  const range = campaignTodayRange(campaign);
  if (!range) return false;
  const client = tx ?? prisma;
  const found = await client.sticker.findFirst({
    where: {
      buyerId: castUserId,
      userId: recipientId,
      stickerTemplateId: campaign.stickerTemplateId,
      createdAt: { gte: range.start, lte: range.end },
    },
    select: { id: true },
  });
  return !!found;
}

/** CheckEventGiftDailyLimit */
export async function checkEventGiftDailyLimit(input: {
  buyerId: number;
  recipientId: number;
  templateId: number;
}) {
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: input.buyerId } });
  if (buyer.userType !== 'cast') throw new InteractorFailure('キャストのみ配布できます');

  const campaign = await activeEventCampaignFor(input.templateId);
  if (!campaign) throw new InteractorFailure('このギフトは現在配布期間外です');

  const count = await campaignDailySendCount(campaign, buyer.id);
  if (count >= campaign.castDailyLimit) throw new InteractorFailure('本日の配布上限に達しています');

  if (await campaignAlreadySentToRecipientToday(campaign, buyer.id, input.recipientId)) {
    throw new InteractorFailure('同じゲストには1日1回までしか配布できません');
  }

  return campaign;
}

/**
 * CreateEventGiftReward.
 *
 * Past the milestone every gift pays double, and landing exactly on the
 * milestone also pays a lump bonus of reward × threshold.
 */
export async function createEventGiftReward(
  stickerId: number,
  campaign: { id: number; name: string; castRewardAmount: number; milestoneGiftThreshold: number; startAt: Date; endAt: Date; stickerTemplateId: number },
  tx?: Tx,
): Promise<void> {
  const client = tx ?? prisma;
  const sticker = await client.sticker.findUniqueOrThrow({ where: { id: stickerId } });

  await transaction(tx, async (t) => {
    const totalSent = await campaignTotalSendCount(campaign, sticker.buyerId, t);
    const milestoneEnabled = campaign.milestoneGiftThreshold > 0;
    const alreadyPassed = milestoneEnabled && totalSent > campaign.milestoneGiftThreshold;

    const rewardAmount = alreadyPassed ? campaign.castRewardAmount * 2 : campaign.castRewardAmount;

    const ct = await createCreditTransaction(
      {
        chargedUserId: null,
        chargedAmount: 0,
        creditedUserId: sticker.buyerId,
        creditedAmount: rewardAmount,
        category: 'event_gift_reward',
        reason: `イベント「${campaign.name}」ギフト配布`,
        withBalanceUpdates: true,
      },
      t,
    );
    await t.sticker.update({ where: { id: sticker.id }, data: { creditTransactionId: ct.id } });

    if (milestoneEnabled && totalSent === campaign.milestoneGiftThreshold) {
      await createCreditTransaction(
        {
          chargedUserId: null,
          chargedAmount: 0,
          creditedUserId: sticker.buyerId,
          creditedAmount: campaign.castRewardAmount * campaign.milestoneGiftThreshold,
          category: 'event_gift_reward',
          reason: `イベント「${campaign.name}」${campaign.milestoneGiftThreshold}個達成ボーナス`,
          withBalanceUpdates: true,
        },
        t,
      );
    }
  });
}

/** PurchaseEventGift — CheckEventGiftDailyLimit, GiveSticker, CreateEventGiftReward. */
export async function purchaseEventGift(input: {
  buyerId: number;
  recipientId: number;
  templateId: number;
  conversationId?: number | null;
}): Promise<GiveStickerResult> {
  const campaign = await checkEventGiftDailyLimit(input);
  const result = await giveSticker(input);
  await createEventGiftReward(result.stickerId, campaign);
  return result;
}

// --- roulette --------------------------------------------------------------

/** Roulette#roll — weighted pick out of 1000. */
export function rollRoulette(entries: Array<{ id: number; chancePermille: number }>): { id: number } | null {
  if (!entries.length) return null;
  const number = Math.floor(Math.random() * 1000);
  let threshold = 0;
  for (const entry of entries) {
    threshold += entry.chancePermille;
    if (number < threshold) return entry;
  }
  // the weights do not sum to 1000 (invalid data): fall back to the first entry
  return entries[0];
}

/** Roulette#roll_big — a guaranteed decent slot in the reel. */
export function rollRouletteBig(entries: Array<{ id: number; chancePermille: number; highValue: boolean }>) {
  const highValue = entries.filter((entry) => entry.highValue);
  if (highValue.length) return highValue[Math.floor(Math.random() * highValue.length)];
  return rollRoulette(entries);
}

/**
 * StickersController#roulette — builds (or re-reads) the pending reel.
 *
 * The reel is four entries: the winner first, then two random and one
 * high-value slot, shuffled. The winner is always `outcome.first`, so the UI can
 * animate to a known result. A pending roll is returned again rather than
 * re-rolled, which stops a guest from rerolling by reloading.
 */
export async function buildOrFetchRouletteRoll(input: {
  rouletteId: number;
  payerId: number;
  granteeId: number;
}): Promise<{ rollId: number; outcomeIds: number[]; winningEntryId: number; pending: boolean }> {
  const existing = await prisma.rouletteRoll.findFirst({
    where: { pending: true, rouletteId: input.rouletteId, payerId: input.payerId, granteeId: input.granteeId },
  });
  if (existing) {
    return {
      rollId: existing.id,
      outcomeIds: (existing.outcome as number[]) ?? [],
      winningEntryId: existing.winningEntryId,
      pending: true,
    };
  }

  const entries = await prisma.rouletteEntry.findMany({ where: { rouletteId: input.rouletteId } });
  if (!entries.length) throw new InteractorFailure('ルーレットの設定がありません');

  const reel = [rollRoulette(entries), rollRoulette(entries), rollRouletteBig(entries)].filter(
    (entry): entry is { id: number } => !!entry,
  );
  // Ruby: 2.times.map{roll} << roll_big, shuffle!, then unshift(roll)
  for (let i = reel.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [reel[i], reel[j]] = [reel[j], reel[i]];
  }
  const winner = rollRoulette(entries);
  if (!winner) throw new InteractorFailure('ルーレットの設定がありません');
  const outcomeIds = [winner.id, ...reel.map((entry) => entry.id)];

  const roll = await prisma.rouletteRoll.create({
    data: {
      rouletteId: input.rouletteId,
      payerId: input.payerId,
      granteeId: input.granteeId,
      outcome: outcomeIds,
      winningEntryId: winner.id,
    },
  });

  return { rollId: roll.id, outcomeIds, winningEntryId: winner.id, pending: true };
}

/** StickersController#pay_for_prize — charge the roulette fee, hand over the prize. */
export async function payForRoulettePrize(input: {
  rouletteId: number;
  payerId: number;
  granteeId: number;
  conversationId: number;
}): Promise<GiveStickerResult> {
  const roll = await prisma.rouletteRoll.findFirst({
    where: {
      rouletteId: input.rouletteId,
      payerId: input.payerId,
      granteeId: input.granteeId,
      pending: true,
    },
    include: {
      roulette: true,
      winningEntry: { include: { stickerTemplate: true } },
    },
  });
  if (!roll) throw new InteractorFailure('無効なID');

  const ct = await createCreditTransaction({
    chargedAmount: roll.roulette.fee,
    chargedUserId: input.payerId,
    creditedAmount: stickerRevenue(roll.winningEntry.stickerTemplate),
    creditedUserId: input.granteeId,
    reason: 'ギフトルーレット',
    category: 'sticker',
    withBalanceUpdates: true,
  });

  const result = await giveSticker({
    buyerId: input.payerId,
    recipientId: input.granteeId,
    templateId: roll.winningEntry.stickerTemplateId,
    conversationId: input.conversationId,
    creditTransactionId: ct.id,
  });

  await prisma.rouletteRoll.update({ where: { id: roll.id }, data: { pending: false } });
  return result;
}
