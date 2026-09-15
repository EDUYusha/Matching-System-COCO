'use client';

import { useRef, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * CastController#identity_check / #check_identity, and #interview_request.
 *
 * The document is stored outside the public uploads area, as the original copied
 * it into a private directory rather than through Shrine.
 */
export function IdentityCheckPage({ interviewOnly = false }: { interviewOnly?: boolean }): ReactNode {
  const { run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, refetch } = useApiQuery<{ alreadyUploaded: boolean; interview: boolean }>(
    ['cast', 'identity_check'],
    interviewOnly ? '/cast/interview_request' : '/cast/identity_check',
  );

  if (isLoading) return <PageLoading />;

  async function upload(file: File): Promise<void> {
    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    await run(api.post<{ redirect: string; flash: { type: string; message: string } }>('/cast/check_identity', body), {
      invalidate: [['me'], ['cast', 'identity_check']],
    });
    setUploading(false);
    await refetch();
  }

  async function setInterview(interview: boolean): Promise<void> {
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/cast/request_interview', { interview }),
    );
    await refetch();
  }

  return (
    <div>
      <PageHeader title={interviewOnly ? '面接の希望' : '身分証明書のアップロード'} back="/user/settings" />

      {!interviewOnly ? (
        <>
          <div className="px-4 py-4 text-[11px] leading-relaxed text-ink-700">
            <p className="mb-2">
              キャストになるためには、顔写真のある下記のいずれかの身分証明書が必要です。
            </p>
            <ol className="list-inside list-decimal space-y-0.5 text-ink-500">
              <li>運転免許証</li>
              <li>パスポート</li>
              <li>学生証の場合には保険証も必要</li>
            </ol>
            <p className="mt-2 text-ink-500">
              ご提出いただいた画像は審査のみに使用し、公開されることはありません。
            </p>
          </div>

          {data?.alreadyUploaded ? (
            <div className="mx-4 card border-emerald-500/40 bg-emerald-950/25">
              <p className="text-xs text-emerald-200">
                アップロード済みです。管理者が確認するまでお待ちください。
              </p>
            </div>
          ) : null}

          <div className="px-4 py-4">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? <Spinner /> : null}
              {data?.alreadyUploaded ? '別の画像を再提出する' : '画像を選択してアップロード'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = '';
              }}
            />
          </div>
        </>
      ) : null}

      <section>
        <h2 className="section-title">面接の希望</h2>
        <div className="px-4 pb-6">
          <p className="mb-3 text-[11px] text-ink-500">
            面接をご希望の場合はこちらをオンにしてください。運営局からご連絡します。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={data?.interview ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
              onClick={() => void setInterview(true)}
            >
              面接を希望する
            </button>
            <button
              type="button"
              className={!data?.interview ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
              onClick={() => void setInterview(false)}
            >
              希望しない
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
