import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/stickers/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('financial_history');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const sticker = await prisma.sticker.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      template: true,
      buyer: { select: { id: true, nickName: true, profilePicUrl: true } },
      user: { select: { id: true, nickName: true, profilePicUrl: true } },
      creditTransaction: true,
    },
  });

  if (![sticker.buyerId, sticker.userId].includes(user.id)) {
    throw new ForbiddenError('禁止だ', '/financial/history');
  }

  return {
    sticker: {
      id: sticker.id,
      createdAt: sticker.createdAt.toISOString(),
      template: {
        id: sticker.template.id,
        name: sticker.template.name,
        pictureUrl: sticker.template.pictureUrl,
        price: sticker.template.price,
      },
      buyer: sticker.buyer,
      recipient: sticker.user,
      chargedAmount: sticker.creditTransaction?.chargedAmount ?? null,
      creditedAmount: sticker.creditTransaction?.creditedAmount ?? null,
    },
  };
});
