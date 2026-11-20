import { AN, config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requiredAction } from '@/server/auth/session';
import { toCurrentUser } from '@/server/lib/serializers';
import { createUser } from '@/server/services/users';
import { readSession, setSession } from '@/server/auth/session';
import { verifyCode } from '@/server/services/sms-verification';
import { jsonBody, route } from '@/server/http/route';
import { signupSchema, writeSignupAttributes } from '@/server/api/users-shared';
export const dynamic = 'force-dynamic';

/** users: POST /users */
export const POST = route(async (request) => {
  const body = signupSchema.parse(await jsonBody(request));
  const scratch = (await readSession())?.scratch ?? {};

  // the number the code was actually sent to, once a code has been checked
  let verifiedPhone: string | null = null;

  if (config.require_sms_verification) {
    const verification = await verifyCode(scratch.sms_verification_id, body.smsVerificationCode ?? '');
    if (!verification.ok) {
      throw new AppError(
        verification.reason === 'too_many_attempts'
          ? '認証コードの試行回数を超えました。お手数ですが、もう一度お試しください。'
          : '認証コードは無効です。',
        { statusCode: 422 },
      );
    }
    verifiedPhone = verification.phone;
  }

  const { user } = await createUser({
    nickName: body.nickName,
    email: body.email ?? null,
    password: body.password ?? null,
    passwordConfirmation: body.passwordConfirmation ?? null,
    userType: 'customer',
    snsId: scratch.sns_id ?? null,
    phone: verifiedPhone ?? scratch.telephone_number ?? body.phone ?? null,
    birthday: body.birthday ? new Date(body.birthday) : null,
    birthdayPublished: body.birthdayPublished ?? null,
    age: body.age ?? null,
    inviterCode: body.inviterCode ?? scratch.inviter_code ?? null,
    adSource: scratch.utm_source ?? null,
    profilePicUrl: scratch.sns_profile_pic_url ?? null,
  });

  // the two free-text attributes the signup form collects
  await writeSignupAttributes(user.id, body);

  await prisma.user.update({
    where: { id: user.id },
    data: { loggedOut: false, lastLogin: new Date(), lastActivity: new Date() },
  });
  await setSession({ userId: user.id });

  const fresh = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { businessArea: true, castLevel: true, customerLevel: true, settings: true },
  });

  return {
    ok: true,
    user: toCurrentUser(fresh),
    requiredAction: requiredAction(fresh),
    redirect: `/users/complete_registration?user_type=${user.userType}`,
    flash: { type: 'notice', message: `${AN.Full}にようこそ。` },
  };
});
