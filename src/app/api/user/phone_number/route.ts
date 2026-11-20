import { z } from 'zod';
import { AN } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { readSession, requireUser, setSession } from '@/server/auth/session';
import { verifyCode } from '@/server/services/sms-verification';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: PATCH /user/phone_number */
export const PATCH = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ smsVerificationCode: z.string() }).parse(await jsonBody(request));
  const scratch = (await readSession())?.scratch ?? {};

  // the code and the number it was sent to both come from the server-side
  // record, so neither can be read or chosen by the caller
  const verification = await verifyCode(scratch.sms_verification_id, body.smsVerificationCode);
  if (!verification.ok) {
    throw new AppError(
      verification.reason === 'too_many_attempts'
        ? '認証コードの試行回数を超えました。お手数ですが、もう一度お試しください。'
        : '認証コードは無効です。',
      { statusCode: 422 },
    );
  }

  const newRegistration = !user.phone?.trim();
  await prisma.user.update({
    where: { id: user.id },
    data: { phone: verification.phone },
  });

  const nextScratch = { ...scratch };
  delete nextScratch.sms_verification_id;
  await setSession({ userId: user.id, scratch: nextScratch });

  return newRegistration
    ? {
        ok: true,
        redirect: `/users/complete_registration?user_type=${user.userType}`,
        flash: { type: 'notice', message: `電話番号を確認しました。<br>${AN.Full}にようこそ。` },
      }
    : { ok: true, redirect: '/help', flash: { type: 'notice', message: '電話番号を更新しました。' } };
});
