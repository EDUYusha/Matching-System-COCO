import { z } from 'zod';
import { AppError } from '@/server/lib/errors';
import { validateUser, assertValid } from '@/server/services/users';
import { sendVerificationSms } from '@/server/services/sms';
import { issueVerification } from '@/server/services/sms-verification';
import { readSession, requireUser, setSession } from '@/server/auth/session';
import { clientIp, jsonBody, route } from '@/server/http/route';
import { enforceRateLimit, RATE_LIMITS } from '@/server/lib/rate-limit';
export const dynamic = 'force-dynamic';

/** users: POST /user/phone_number_verification */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ phone: z.string() }).parse(await jsonBody(request));

  if (user.phone === body.phone) {
    throw new AppError('電話番号は変わりませんでした。', { redirect: '/help' });
  }

  const errors = await validateUser(
    {
      id: user.id,
      email: user.email,
      snsId: user.snsId,
      nickName: user.nickName,
      userType: user.userType,
      accessLevel: user.accessLevel,
      serviceFeePermille: user.serviceFeePermille,
      phone: body.phone,
      birthday: user.birthday,
    },
    {},
  );
  assertValid(errors);

  // a real Twilio message goes out per call, so the number and the caller
  // are both limited before anything is sent
  await enforceRateLimit('sms', body.phone, RATE_LIMITS.smsPerPhone);
  await enforceRateLimit('sms-ip', clientIp(request), RATE_LIMITS.smsPerIp);

  const { code, phone } = await sendVerificationSms(body.phone);
  // only a handle goes in the session: the session is a signed, readable JWT,
  // so the code itself stays server-side (see services/sms-verification.ts)
  const verificationId = await issueVerification(phone, code);
  await setSession({
    userId: user.id,
    scratch: { ...((await readSession())?.scratch ?? {}), sms_verification_id: verificationId },
  });
  return { ok: true };
});
