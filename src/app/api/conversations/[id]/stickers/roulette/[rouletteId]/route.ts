import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { buildOrFetchRouletteRoll } from '@/server/services/stickers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
import { rouletteInit } from '@/server/api/stickers-shared';
export const dynamic = 'force-dynamic';

/** stickers: GET /conversations/:id/stickers/roulette/:rouletteId */
export const GET = route<{ id: string; rouletteId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z
    .object({ id: z.coerce.number(), rouletteId: z.coerce.number() })
    .parse(routeParams);

  const { roulette, partnerId, conversationId } = await rouletteInit(user, params.id, params.rouletteId);

  const roll = await buildOrFetchRouletteRoll({
    rouletteId: roulette.id,
    payerId: user.id,
    granteeId: partnerId,
  });

  const entries = await prisma.rouletteEntry.findMany({
    where: { id: { in: roll.outcomeIds } },
    include: { stickerTemplate: true },
  });

  return {
    roll: {
      id: roll.rollId,
      rouletteId: roulette.id,
      fee: roulette.fee,
      pending: roll.pending,
      winningEntryId: roll.winningEntryId,
      // order matters: the first entry is the winner
      outcome: roll.outcomeIds.map((entryId) => {
        const entry = entries.find((candidate) => candidate.id === entryId);
        return {
          id: entryId,
          stickerTemplateId: entry?.stickerTemplateId ?? 0,
          name: entry?.stickerTemplate.name ?? '',
          pictureUrl: entry?.stickerTemplate.pictureUrl ?? '',
        };
      }),
    },
    conversationId,
  };
});
