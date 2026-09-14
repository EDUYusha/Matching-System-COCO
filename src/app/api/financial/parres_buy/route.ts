import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
import { authenticate3ds, payment3ds } from '@/server/services/payment-gateway';
import { buyCredits3d } from '@/server/services/buy-credits';
import { jsonBody, queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: POST /financial/parres_buy */
export const POST = route(async (request, { searchParams }) => {
  const body = z
    .object({ status: z.string().optional(), MD: z.string().optional(), PaRes: z.string().optional() })
    .parse(await jsonBody(request) ?? {});
  const query = z
    .object({ charge_amount: z.coerce.number().optional(), credits: z.coerce.number().optional() })
    .parse(queryObject(searchParams));

  if (body.status !== 'success') {
    logger.error({ md: body.MD, status: body.status }, 'parres_buy: point buy failed');
    return NextResponse.json({ status: 'error', message: 'カード処理中にエラーが発生しました。' }, { status: 200 });
  }

  await authenticate3ds({ xid: body.MD ?? '', paRes: body.PaRes ?? '' });
  const payment = await payment3ds({ xid: body.MD ?? '' });

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
    await buyCredits3d({
      userId: user.id,
      conversionCode: payment.orderNumber,
      chargeAmount: query.charge_amount ?? 0,
      credits: query.credits ?? 0,
      category: 'charge',
    });
    return NextResponse.json({
      status: 'success',
      redirect_url: '/financial/history',
      message: 'ポイントを購入しました。',
    }, { status: 200 });
  }

  logger.error({ token, code: payment.code, userId: user?.id }, 'parres_buy: failed upstream');
  return NextResponse.json({
    status: 'error',
    message: `カード処理中にエラーが発生しました。\n token: ${token}`,
  }, { status: 200 });
});
