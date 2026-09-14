import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { enroll3ds } from '@/server/services/payment-gateway';
import { allChargeSteps, chargeStepFor } from '@/server/services/buy-credits';
import { env } from '@/server/config/env';
import { requirePermission } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/charge */
export const GET = route(async (_request) => {
  const user = await requirePermission('customer');
  const card = await prisma.creditCard.findUnique({ where: { userId: user.id } });
  return {
    steps: allChargeSteps(),
    creditBalance: user.creditBalance,
    card: card
      ? {
          status: card.status,
          maskedCardNumber: card.maskedCardNumber,
          expiryYear: card.expiryYear,
          expiryMonth: card.expiryMonth,
          nameOnCard: card.nameOnCard,
        }
      : null,
  };
});

/** financial: POST /financial/charge */
export const POST = route(async (request) => {
  const user = await requirePermission('customer');
  const body = z
    .object({ axesTokenValue: z.string().min(1), creditAmount: z.coerce.number() })
    .parse(await jsonBody(request));

  if (!user.creditcardToken) throw new AppError('エラーが発生しました。', { redirect: '/financial/charge' });

  // The guest is charged the displayed yen price; the bonus is free credits on
  // top, and the credited total is rounded up to a whole 1000.
  const step = chargeStepFor(body.creditAmount);
  if (step.yen <= 0) throw new AppError('エラーが発生しました。', { redirect: '/financial/charge' });

  const card = await prisma.creditCard.findUnique({ where: { userId: user.id } });

  const result = await enroll3ds({
    tokenKey: body.axesTokenValue,
    amount: step.yen,
    sendId: user.creditcardToken,
    sendPoint: 'registercard',
    userId: user.id,
    holder: { nameOnCard: card?.nameOnCard ?? null, phone: user.phone },
  });

  if (result.status !== 'success') {
    logger.error({ raw: result.raw, userId: user.id }, 'make_charge: Axes error');
    throw new AppError(`エラーが発生しました。\n ${result.raw}`, { redirect: '/financial/charge' });
  }

  return {
    ok: true,
    status: 'pending',
    md: result.xid,
    threeDs2Flag: '2',
    termUrl: `${env.publicUrl}/api/financial/parres_buy?charge_amount=${step.yen}&credits=${step.total}`,
    iframeUrl: result.iframeUrl ? decodeURIComponent(result.iframeUrl) : null,
    pareq: 'PaReq',
    chargeAmount: step.yen,
    credits: step.total,
    flash: {
      type: 'notice',
      message: '購入処理中です。しばらくお待ちください。\n画面に変化がなければページを更新ください。',
    },
  };
});
