import { access, numberToCredits } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
/**
 * Shared by the stickers route handlers: the schemas and query helpers
 * the original stickers.ts declared once and used from several actions.
 */

/**
 * StickersController#roulette_init — the roulette is only available in a private
 * room with a fully registered cast, and only when the guest can afford a roll.
 */
export async function rouletteInit(
  user: { id: number; creditBalance: number; customerLevelId: number | null },
  conversationId: number,
  rouletteId: number,
) {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { speakers: { include: { user: true } } },
  });
  if (conversation.category !== 'private') {
    throw new AppError('ギフトは個人チャットでしかできません。', {
      redirect: `/conversations/${conversationId}`,
    });
  }

  const partnerSpeaker = conversation.speakers.find((speaker) => speaker.userId !== user.id);
  const partner = partnerSpeaker?.user;
  if (!partner || partner.userType !== 'cast' || !access(partner.accessLevel, 'receive_stickers')) {
    throw new AppError('ギフトは登録済のキャストとだけです。', {
      redirect: `/conversations/${conversationId}`,
    });
  }

  // the same refusal as ordinary gifts to a cast who has blocked this guest
  const blocked = await prisma.blocking.findFirst({
    where: { userId: partner.id, targetId: user.id },
    select: { id: true },
  });
  if (blocked) {
    throw new AppError('このユーザーは現在ギフトが無効に設定しております。', {
      redirect: `/conversations/${conversationId}`,
    });
  }

  const roulette = await prisma.roulette.findFirst({ where: { id: rouletteId, active: true } });
  if (!roulette) throw new AppError('無効なID', { statusCode: 404 });

  if (user.creditBalance < roulette.fee) {
    throw new AppError(
      `ポイントが足りません。ルーレット料金は${numberToCredits(roulette.fee)}で、現在のポイントは${numberToCredits(user.creditBalance)}だけです。`,
      { redirect: '/financial/charge' },
    );
  }

  return { roulette, partnerId: partner.id, conversationId: conversation.id };
}
