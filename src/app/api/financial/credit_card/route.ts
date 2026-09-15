import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { urlsafeBase64 } from '@/server/lib/auth';
import { accountDurationCode, enroll3ds } from '@/server/services/payment-gateway';
import { hasValidCreditCard } from '@/server/services/users';
import { env } from '@/server/config/env';
import { requirePermission } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/credit_card */
export const GET = route(async (_request) => {
  const user = await requirePermission('customer');
  const card = await prisma.creditCard.findUnique({ where: { userId: user.id } });
  return {
    card: card
      ? {
          status: card.status,
          maskedCardNumber: card.maskedCardNumber,
          expiryYear: card.expiryYear,
          expiryMonth: card.expiryMonth,
          nameOnCard: card.nameOnCard,
        }
      : null,
    hasValidCard: hasValidCreditCard(user),
  };
});

/** financial: POST /financial/credit_card */
export const POST = route(async (request) => {
  const user = await requirePermission('customer');
  const body = z
    .object({
      axesTokenValue: z.string().min(1, 'invalid payment processor response'),
      maskedCardNumber: z.string().optional().nullable(),
      expiryYear: z.coerce.number().optional().nullable(),
      expiryMonth: z.coerce.number().optional().nullable(),
      nameOnCard: z.string().optional().nullable(),
      maskedCardCvv: z.string().optional().nullable(),
    })
    .parse(await jsonBody(request));

  const card = await prisma.creditCard.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: 'invalid',
      maskedCardNumber: body.maskedCardNumber ?? null,
      expiryYear: body.expiryYear ?? null,
      expiryMonth: body.expiryMonth ?? null,
      nameOnCard: body.nameOnCard ?? null,
      maskedCardCvv: body.maskedCardCvv ?? null,
    },
    update: {
      status: 'invalid',
      maskedCardNumber: body.maskedCardNumber ?? null,
      expiryYear: body.expiryYear ?? null,
      expiryMonth: body.expiryMonth ?? null,
      nameOnCard: body.nameOnCard ?? null,
      maskedCardCvv: body.maskedCardCvv ?? null,
    },
  });

  // the "!" prefix marks the registration as pending
  const newToken = urlsafeBase64();
  await prisma.user.update({ where: { id: user.id }, data: { creditcardToken: `!${newToken}` } });
  logger.info({ userId: user.id }, 'register_credit_card: starting card registration');

  const result = await enroll3ds({
    tokenKey: body.axesTokenValue,
    amount: 0,
    sendId: newToken,
    sendPoint: 'registercard',
    userId: user.id,
    holder: { nameOnCard: card.nameOnCard, phone: user.phone },
  });

  if (result.status !== 'success') {
    logger.error({ raw: result.raw, userId: user.id }, 'register_credit_card: Axes error');
    throw new AppError(`エラーが発生しました。\n ${result.raw}`, { redirect: '/financial/credit_card' });
  }

  logger.info({ userId: user.id, xid: result.xid }, 'register_credit_card: got 3DS iframe url');

  return {
    ok: true,
    status: 'pending',
    md: result.xid,
    threeDs2Flag: '2',
    termUrl: `${env.publicUrl}/api/financial/parres`,
    iframeUrl: result.iframeUrl ? decodeURIComponent(result.iframeUrl) : null,
    pareq: 'PaReq',
    flash: { type: 'notice', message: 'クレジットカードを登録開始しました。' },
    accountDurationCode: accountDurationCode(card.createdAt),
  };
});
