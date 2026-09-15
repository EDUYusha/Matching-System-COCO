import { z } from 'zod';
import { updateBasics } from '@/server/services/users';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: POST /profile/basics */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z
    .object({
      nickName: z.string().optional(),
      motto: z.string().nullable().optional(),
      age: z.coerce.number().nullable().optional(),
      birthday: z.string().nullable().optional(),
      birthdayPublished: z.coerce.number().nullable().optional(),
      orderFeePerTime: z.coerce.number().nullable().optional(),
    })
    .parse(await jsonBody(request));

  await updateBasics(user.id, {
    ...body,
    birthday: body.birthday === undefined ? undefined : body.birthday ? new Date(body.birthday) : null,
  });

  return { ok: true, redirect: '/profile/settings', flash: { type: 'notice', message: '更新しました。' } };
});
