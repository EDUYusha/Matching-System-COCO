import { z } from 'zod';
import { exchangeCredits } from '@/server/services/buy-credits';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/financial/credit_exchange */
export const POST = route(async (request) => {
  const body = z
    .object({
      user_id: z.coerce.number(),
      amount: z.coerce.number(),
      reason: z.string().optional(),
      cash: z.coerce.number().optional(),
      reflect: z.coerce.number().optional(),
    })
    .parse(await jsonBody(request));

  await exchangeCredits({
    recipientId: body.user_id,
    amount: body.amount,
    reason: body.reason ?? null,
    receivedYen: body.cash ?? 0,
    reflect: body.reflect ?? 0,
  });

  return { ok: true };
});
