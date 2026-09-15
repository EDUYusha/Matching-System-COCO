import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { env } from '@/server/config/env';
import { enqueueMail } from '@/server/jobs/queues';
import { storeUpload } from '@/server/lib/uploads';
import { uploadParts } from '@/server/http/multipart';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** cast: POST /cast/request_agreement */
export const POST = route(async (request) => {
  const user = await requireUser();
  const { access } = await import('@/lib');
  if (!access(user.accessLevel, 'accept_terms')) {
    throw new AppError('権限がありません。', { statusCode: 403, redirect: '/' });
  }

  const parts = await uploadParts(request);
  const baseDir = join(env.castPicturesDir, String(user.id));
  await mkdir(baseDir, { recursive: true });

  const savedFiles: Array<{ name: string; path: string }> = [];
  let index = 1;

  for (const part of parts) {
    if (!part.filename) continue;
    if (!/\.(jpe?g|gif|png)$/i.test(part.filename)) {
      throw new AppError(
        index === 1
          ? '身分証明書の画像はJPEG／GIF／PNGのいずれかで送信してください。'
          : '2枚目の画像はJPEG／GIF／PNGのいずれかで送信してください。',
        { redirect: '/cast/agreement' },
      );
    }
    const extension = part.filename.slice(part.filename.lastIndexOf('.'));
    const name = `${index}-${user.id}${extension}`;
    const staged = await storeUpload(part.file, {
      filename: part.filename,
      mimeType: part.mimetype,
      storage: 'cache',
      validateImage: false,
    });
    const target = join(baseDir, name);
    await copyFile(join(env.uploadsDir, 'cache', staged.id), target);
    await rm(join(env.uploadsDir, 'cache', staged.id), { force: true });
    savedFiles.push({ name, path: target });
    index += 1;
    if (index > 2) break;
  }

  if (!savedFiles.length) {
    throw new AppError('身分証明書の画像（JPEG／GIF／PNG）を選択してください。', {
      redirect: '/cast/agreement',
    });
  }

  await enqueueMail('AgreementMailer.agreement_mail_send', { userId: user.id, files: savedFiles });

  if (user.accessLevel === 'contract_pending') {
    await prisma.user.update({ where: { id: user.id }, data: { accessLevel: 'contract_accepted' } });
  }

  return {
    ok: true,
    redirect: '/conversations',
    flash: {
      type: 'notice',
      message: 'ファイルアップロードありがとうございます。管理者が確認するまでお待ちください。',
    },
  };
});
