import { config } from '@/lib';
import { AppError } from '@/server/lib/errors';
import { validateUser, assertValid } from '@/server/services/users';
import { sendVerificationSms } from '@/server/services/sms';
import { readSession, setSession } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
import { signupSchema } from '@/server/api/users-shared';
export const dynamic = 'force-dynamic';

/** users: POST /users/verify */
export const POST = route(async (request) => {
  const body = signupSchema.parse(await jsonBody(request));

  const errors = await validateUser(
    {
      email: body.email,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
      snsId: (await readSession())?.scratch?.sns_id ?? null,
      nickName: body.nickName,
      userType: 'customer',
      accessLevel: 'full',
      phone: body.phone,
      birthday: body.birthday ? new Date(body.birthday) : null,
      usedAgeSetter: body.age !== undefined && body.age !== null,
    },
    { onCreate: true },
  );
  assertValid(errors);

  if (!config.require_sms_verification) return { ok: true, smsRequired: false };
  if (!body.phone) throw new AppError('電話番号を入力してください');

  const { code, phone } = await sendVerificationSms(body.phone);
  await setSession({
    userId: 0,
    scratch: { ...((await readSession())?.scratch ?? {}), sms_verification_code: code, telephone_number: phone },
  });
  return { ok: true, smsRequired: true };
});
