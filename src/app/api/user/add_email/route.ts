import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { hashPassword } from '@/server/lib/auth';
import { validateUser, assertValid } from '@/server/services/users';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** users: POST /user/add_email */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z
    .object({ email: z.string(), password: z.string(), passwordConfirmation: z.string() })
    .parse(await jsonBody(request));

  const errors = await validateUser(
    {
      id: user.id,
      email: body.email,
      password: body.password,
      passwordConfirmation: body.passwordConfirmation,
      snsId: user.snsId,
      nickName: user.nickName,
      userType: user.userType,
      accessLevel: user.accessLevel,
      serviceFeePermille: user.serviceFeePermille,
      phone: user.phone,
      birthday: user.birthday,
    },
    {},
  );
  assertValid(errors);

  await prisma.user.update({
    where: { id: user.id },
    data: { email: body.email, passwordDigest: await hashPassword(body.password) },
  });

  return {
    ok: true,
    redirect: '/help',
    flash: {
      type: 'notice',
      message: 'メールアドレスを追加しました。今からこのログイン情報でもログインできます。',
    },
  };
});
