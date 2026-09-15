import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { createOperatorConversation, findConversationWithPartner } from '@/server/services/conversations';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** conversations: POST /conversations/operator/:businessAreaId */
export const POST = route<{ businessAreaId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ businessAreaId: z.coerce.number() }).parse(routeParams);

  const mainOperator = await prisma.user.findFirst({
    where: { userType: 'operator', businessAreaId: params.businessAreaId, discardedAt: null },
    orderBy: { id: 'asc' },
  });
  if (!mainOperator) throw new AppError('No operator!');

  const existing = await findConversationWithPartner(user.id, mainOperator.id, {});
  if (existing) return { ok: true, conversationId: existing, redirect: `/conversations/${existing}` };

  const conversation = await createOperatorConversation(user.id, params.businessAreaId);
  return { ok: true, conversationId: conversation.id, redirect: `/conversations/${conversation.id}` };
});
