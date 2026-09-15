import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
import { verifyChargeCallbackSignature } from '@/server/lib/charge-callback';
import { authenticate3ds, payment3ds } from '@/server/services/payment-gateway';
import { buyCredits3d } from '@/server/services/buy-credits';
import { jsonBody, queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

const FAILED = 'カード処理中にエラーが発生しました。';

/** financial: POST /financial/parres_buy */
export const POST = route(async (request, { searchParams }) => {
  const body = z
    .object({ status: z.string().optional(), MD: z.string().optional(), PaRes: z.string().optional() })
    .parse(await jsonBody(request) ?? {});
  const query = z
    .object({
      charge_amount: z.coerce.number().int().positive().optional(),
      credits: z.coerce.number().int().positive().optional(),
      sig: z.string().optional(),
    })
    .parse(queryObject(searchParams));

  if (body.status !== 'success') {
    logger.error({ md: body.MD, status: body.status }, 'parres_buy: point buy failed');
    return NextResponse.json({ status: 'error', message: FAILED }, { status: 200 });
  }

  // The amounts come from the query string, so they are only trusted when the
  // signature make_charge put on the termUrl still matches this transaction.
  const xid = body.MD ?? '';
  if (
    !xid ||
    query.charge_amount === undefined ||
    query.credits === undefined ||
    !query.sig ||
    !verifyChargeCallbackSignature(xid, query.charge_amount, query.credits, query.sig)
  ) {
    logger.error({ md: body.MD, query }, 'parres_buy: amounts do not match the signed termUrl');
    return NextResponse.json({ status: 'error', message: FAILED }, { status: 200 });
  }

  await authenticate3ds({ xid, paRes: body.PaRes ?? '' });
  const payment = await payment3ds({ xid });

  const token = payment.sendId;
  const user = token
    ? ((await prisma.user.findFirst({ where: { creditcardToken: `!${token}` } })) ??
      (await prisma.user.findFirst({ where: { creditcardToken: token } })))
    : null;

  logger.info(
    { status: payment.status, code: payment.code, userId: user?.id },
    'parres_buy: payment result',
  );

  if (payment.status === 'success' && user) {
    // a repeated callback for an order that is already booked must not book it again
    const alreadyBooked = payment.orderNumber
      ? await prisma.creditConversion.findFirst({ where: { code: payment.orderNumber }, select: { id: true } })
      : null;

    if (alreadyBooked) {
      logger.warn({ orderNumber: payment.orderNumber, userId: user.id }, 'parres_buy: order already booked');
    } else {
      await buyCredits3d({
        userId: user.id,
        conversionCode: payment.orderNumber,
        chargeAmount: query.charge_amount,
        credits: query.credits,
        category: 'charge',
      });
    }
    return NextResponse.json({
      status: 'success',
      redirect_url: '/financial/history',
      message: 'ポイントを購入しました。',
    }, { status: 200 });
  }

  logger.error({ token, code: payment.code, userId: user?.id }, 'parres_buy: failed upstream');
  return NextResponse.json({
    status: 'error',
    message: `${FAILED}\n token: ${token}`,
  }, { status: 200 });
});
