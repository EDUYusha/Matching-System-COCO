import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { ForbiddenError } from '@/server/lib/errors';
import { wishToAttendToMeeting } from '@/server/services/meetings/selection';
import { handleFailedMeeting } from '@/server/services/meetings/finances';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: POST /meetings/:id/wish_to_attend */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  if (user.userType !== 'cast') throw new ForbiddenError('Must be cast!', '/conversations');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z.object({ friendIds: z.array(z.coerce.number()).optional() }).parse(await jsonBody(request) ?? {});

  try {
    await wishToAttendToMeeting({ meetingId: params.id, castId: user.id, friendIds: body.friendIds });
  } catch (error) {
    const failureStatus = (error as { failureStatus?: string }).failureStatus;
    if (failureStatus === 'pre_charge_fail') {
      await handleFailedMeeting({ meetingId: params.id, failureStatus });
      const systemConversation = await prisma.conversation.findFirst({
        where: { category: 'system', speakers: { some: { userId: user.id } } },
        select: { id: true },
      });
      return { ok: false, redirect: `/conversations/${systemConversation?.id ?? ''}` };
    }
    throw error;
  }

  return { ok: true, redirect: '/meetings', flash: { type: 'notice', message: '参加依頼を登録しました。' } };
});
