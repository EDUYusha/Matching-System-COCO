import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { hasValidCreditCard } from '@/server/services/users';
import { activeEventCampaignFor, purchaseEventGift, purchaseSticker } from '@/server/services/stickers';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** stickers: POST /conversations/:id/stickers/:stickerId */
export const POST = route<{ id: string; stickerId: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z
    .object({ id: z.coerce.number(), stickerId: z.coerce.number() })
    .parse(routeParams);
  const body = z.object({ noFame: z.boolean().optional() }).parse(await jsonBody(request) ?? {});

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: params.id },
    include: { speakers: true },
  });
  const mySpeaker = conversation.speakers.find((speaker) => speaker.userId === user.id);
  const partnerSpeaker = conversation.speakers.find((speaker) => speaker.userId !== user.id);

  if (!mySpeaker || !partnerSpeaker || conversation.category !== 'private') {
    throw new ForbiddenError('No permission', '/conversations');
  }

  const blocked = await prisma.blocking.findFirst({
    where: { userId: partnerSpeaker.userId, targetId: user.id },
  });
  if (blocked) {
    throw new AppError('このユーザーは現在ギフトが無効に設定しております。', {
      redirect: `/conversations/${conversation.id}`,
    });
  }

  const template = await prisma.stickerTemplate.findUniqueOrThrow({ where: { id: params.stickerId } });
  const campaign = await activeEventCampaignFor(template.id);
  const isEventChoco = !!campaign;

  if (!isEventChoco && !hasValidCreditCard(user)) {
    throw new AppError('サービスのご利用にはクレジットカードの情報入力が必要です。', {
      redirect: '/financial/credit_card',
    });
  }

  const input = {
    buyerId: user.id,
    recipientId: partnerSpeaker.userId,
    templateId: template.id,
    conversationId: conversation.id,
  };
  if (isEventChoco) await purchaseEventGift(input);
  else await purchaseSticker(input);

  // the gift dialog doubles as the "show me in the hall of fame" toggle
  if (body.noFame !== undefined) {
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, noFame: body.noFame },
      update: { noFame: body.noFame },
    });
  }

  return { ok: true, redirect: `/conversations/${conversation.id}` };
});
