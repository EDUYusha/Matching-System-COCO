import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { enqueueMail } from '@/server/jobs/queues';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: POST /cast/request_interview */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ interview: z.boolean() }).parse(await jsonBody(request));

  await prisma.accessRequest.upsert({
    where: { userId: user.id },
    create: { userId: user.id, interview: body.interview },
    update: { interview: body.interview },
  });

  if (body.interview && config.admin_interview_request_email) {
    await enqueueMail('AdminMailer.interview_request', { userId: user.id });
  }

  return {
    ok: true,
    redirect: '/conversations',
    flash: {
      type: 'notice',
      message: body.interview ? 'ありがとうございます。面接の連絡をお待ちください。' : '面接をキャンセルしました。',
    },
  };
});
