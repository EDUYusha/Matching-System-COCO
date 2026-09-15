'use client';

import { useRef, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * CastController#agreement / #request_agreement.
 *
 * Up to two images of the signed agreement are accepted; the API mails them to
 * the operators and advances the access level to contract_accepted.
 */
export function AgreementPage(): ReactNode {
  const { run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { isLoading } = useApiQuery<{ ok: boolean }>(['cast', 'agreement'], '/cast/agreement');
  if (isLoading) return <PageLoading />;

  async function submit(): Promise<void> {
    if (!files.length) return;
    setSubmitting(true);
    const body = new FormData();
    for (const file of files) body.append('files', file);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/cast/request_agreement', body),
      { invalidate: [['me']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="同意書の提出" back="/user/settings" />

      <div className="px-4 py-4 text-[11px] leading-relaxed text-ink-700">
        <p>
          サービス利用にあたっての同意書に署名のうえ、画像（JPEG／GIF／PNG）をご提出ください。
          最大2枚までアップロードできます。
        </p>
        <p className="mt-2 text-ink-500">
          金銭の直接の授受、次回は直接現金で会うなどの禁止事項については特にご確認をお願いします。
        </p>
      </div>

      {files.length ? (
        <div className="grid grid-cols-2 gap-2 px-4">
          {files.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative">
              <img src={URL.createObjectURL(file)} alt="" className="aspect-[3/4] w-full rounded object-cover" />
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, candidate) => candidate !== index))}
                className="absolute right-1 top-1 rounded bg-paper-100/85 px-1.5 text-xs text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 px-4 py-4">
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={files.length >= 2}
          onClick={() => fileInput.current?.click()}
        >
          画像を選択（{files.length}/2）
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="hidden"
          onChange={(event) => {
            setFiles([...files, ...Array.from(event.target.files ?? [])].slice(0, 2));
            event.target.value = '';
          }}
        />
        <button type="button" className="btn-primary w-full" disabled={submitting || !files.length} onClick={() => void submit()}>
          {submitting ? <Spinner /> : null}
          提出する
        </button>
      </div>
    </div>
  );
}
