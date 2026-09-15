import { z } from 'zod';
import { payForRoulettePrize } from '@/server/services/stickers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { rouletteInit } from '@/server/api/stickers-shared';
export const dynamic = 'force-dynamic';

/** stickers: POST /conversations/:id/stickers/roulette/:rouletteId/pay_for_prize */
export const POST = route<{ id: string; rouletteId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z
    .object({ id: z.coerce.number(), rouletteId: z.coerce.number() })
    .parse(routeParams);

  const { roulette, partnerId, conversationId } = await rouletteInit(user, params.id, params.rouletteId);

  await payForRoulettePrize({
    rouletteId: roulette.id,
    payerId: user.id,
    granteeId: partnerId,
    conversationId,
  });

  return { ok: true, redirect: `/conversations/${conversationId}` };
});
