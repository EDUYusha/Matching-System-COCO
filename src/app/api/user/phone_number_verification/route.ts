import { z } from 'zod';
import { AppError } from '@/server/lib/errors';
import { validateUser, assertValid } from '@/server/services/users';
import { sendVerificationSms } from '@/server/services/sms';
import { readSession, requireUser, setSession } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
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

  const { code, phone } = await sendVerificationSms(body.phone);
  await setSession({
    userId: user.id,
    scratch: { ...((await readSession())?.scratch ?? {}), sms_verification_code: code, telephone_number: phone },
  });
  return { ok: true };
});
