import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { promoteUpload, storeUpload } from '@/server/lib/uploads';
import { toMessageDto } from '@/server/lib/serializers';
import { createMessage } from '@/server/services/messages';
import { requireUser } from '@/server/auth/session';
import { uploadParts } from '@/server/http/multipart';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** ConversationsController#picture — an image message in a room. */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const speaker = await prisma.speaker.findFirst({
    where: { conversationId: params.id, userId: user.id },
  });
  if (!speaker) throw new ForbiddenError('権利がありません');

  const [file] = await uploadParts(request);
  if (!file) throw new AppError('ファイルを選択してください');

  const cached = await storeUpload(file.file, { filename: file.filename, mimeType: file.mimetype });
  const stored = await promoteUpload(cached);

  const message = await createMessage({
    conversationId: params.id,
    senderId: user.id,
    category: 'picture',
    // the picture's Shrine metadata lives in `content` for picture messages
    content: JSON.stringify(stored),
    withUnread: true,
    withBroadcast: true,
    withoutFormat: true,
  });

  return { ok: true, message: toMessageDto({ ...message, sender: user }, { viewerId: user.id }) };
});
