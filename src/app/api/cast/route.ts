import { z } from 'zod';
import { AN, config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { requiredAction } from '@/server/auth/session';
import { toCurrentUser } from '@/server/lib/serializers';
import { createUser } from '@/server/services/users';
import { writeSignupAttributes } from '@/server/api/users-shared';
import { readSession, setSession } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: POST /cast */
export const POST = route(async (request) => {
  const body = z
    .object({
      nickName: z.string().min(1),
      email: z.string().optional().nullable(),
      password: z.string().optional().nullable(),
      passwordConfirmation: z.string().optional().nullable(),
      age: z.coerce.number().optional().nullable(),
      birthday: z.string().optional().nullable(),
      birthdayPublished: z.coerce.number().optional().nullable(),
      inviterCode: z.string().optional().nullable(),
      phone: z.string().min(1),
      businessAreaId: z.coerce.number(),
      selfPrefectures: z.string().optional().nullable(),
    })
    .parse(await jsonBody(request));

  const scratch = (await readSession())?.scratch ?? {};

  const { user } = await createUser({
    nickName: body.nickName,
    email: body.email ?? null,
    password: body.password ?? null,
    passwordConfirmation: body.passwordConfirmation ?? null,
    userType: 'cast',
    snsId: scratch.sns_id ?? null,
    phone: body.phone,
    birthday: body.birthday ? new Date(body.birthday) : null,
    birthdayPublished: body.birthdayPublished ?? null,
    age: body.age ?? null,
    inviterCode: body.inviterCode ?? scratch.inviter_code ?? null,
    businessAreaId: body.businessAreaId,
    // new cast start on the configured level, unauthorised and hidden
    castLevelId: config.cast_new_level,
    accessLevel: 'unauthorized',
    publicProfile: false,
    serviceFeePermille: 0,
    adSource: scratch.utm_source ?? null,
    profilePicUrl: scratch.sns_profile_pic_url ?? null,
  });

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
    redirect: '/users/complete_registration?user_type=cast',
    flash: { type: 'notice', message: `${AN.Full}にようこそ。` },
  };
});
