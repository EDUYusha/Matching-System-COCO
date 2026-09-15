import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
import { authenticate3ds, payment3ds } from '@/server/services/payment-gateway';
import { enqueueMail } from '@/server/jobs/queues';
import { jsonBody, route } from '@/server/http/route';
import { recentPendingCardUser } from '@/server/api/financial-shared';
export const dynamic = 'force-dynamic';

/** financial: POST /financial/parres */
export const POST = route(async (request) => {
  const body = z
    .object({ status: z.string().optional(), MD: z.string().optional(), PaRes: z.string().optional() })
    .parse(await jsonBody(request) ?? {});

  logger.info({ status: body.status, md: body.MD, hasPaRes: !!body.PaRes }, 'parres: callback received');

  if (body.status !== 'success') {
    const message = '3DS認証が失敗しました';
    logger.error({ md: body.MD, status: body.status }, `parres: ${message}`);
    const candidate = await recentPendingCardUser();
    await enqueueMail('AdminMailer.credit_card_registration_failure', {
      userId: candidate?.id ?? null,
      errorMessage: `${message} (parres_status: ${body.status})`,
      errorCode: null,
    });
    return new NextResponse(null, { status: 200 });
  }

  const auth = await authenticate3ds({ xid: body.MD ?? '', paRes: body.PaRes ?? '' });
  logger.info({ status: auth.status, code: auth.code }, 'parres: authentication result');

  const payment = await payment3ds({ xid: body.MD ?? '' });
  logger.info({ status: payment.status, code: payment.code }, 'parres: payment result');

  const token = payment.sendId;
  if (!token) {
    logger.error({ md: body.MD, raw: payment.raw }, 'parres: no token in response');
    return new NextResponse(null, { status: 200 });
  }

  const user = await prisma.user.findFirst({ where: { creditcardToken: `!${token}` } });

  if (payment.status === 'success' && user) {
    await prisma.user.update({ where: { id: user.id }, data: { creditcardToken: token } });
    await prisma.creditCard.update({ where: { userId: user.id }, data: { status: 'valid' } });
    logger.info({ userId: user.id }, 'parres: card registration succeeded');
    await enqueueMail('AdminMailer.credit_card_registration_success', { userId: user.id });
  } else if (!user) {
    const errorMessage = `Couldn't find user with pending creditcard_token !${token}`;
    logger.error(errorMessage);
    await enqueueMail('AdminMailer.credit_card_registration_failure', {
      userId: null,
      errorMessage,
      errorCode: null,
    });
  } else {
    const errorMessage = 'CreditCard registering failed upstream';
    logger.error({ userId: user.id, code: payment.code }, `parres: ${errorMessage}`);
    await enqueueMail('AdminMailer.credit_card_registration_failure', {
      userId: user.id,
      errorMessage,
      errorCode: payment.code,
    });
  }

  // the gateway requires a bare 200
  return new NextResponse(null, { status: 200 });
});
