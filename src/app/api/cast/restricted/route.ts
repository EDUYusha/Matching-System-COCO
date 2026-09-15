import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
// pulls in the request.file() / request.files() type augmentation

export const dynamic = 'force-dynamic';

/** cast: GET /cast/restricted */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const { access } = await import('@/lib');

  if (access(user.accessLevel, 'accept_terms')) {
    return {
      redirect: '/cast/agreement',
      flash: { type: 'alert', message: 'coco のキャストになるためには契約の認印が必要です。' },
    };
  }
  if (access(user.accessLevel, 'not_rejected')) {
    return {
      redirect: '/cast/identity_check',
      flash: {
        type: 'alert',
        message: `cocoのキャストになるためには、顔写真のある下記のいずれかの身分証明書が必要です。
    ①運転免許書
    ②パスポート
    ③学生証の場合には保険証必要

    アカウントを作成する場合には「身分証明書」の画像を選択してアップロードしてください。`,
      },
    };
  }

  await prisma.user.update({ where: { id: user.id }, data: { loggedOut: true } });
  return {
    redirect: '/',
    flash: { type: 'danger', message: 'このユーザーアカウントは閉鎖になりました。' },
  };
});
