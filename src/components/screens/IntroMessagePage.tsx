'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * IntroMessagesController — the template auto-sent when a chat room is created.
 * `%name%` is replaced with the partner's nickname (IntroMessage#content_for).
 */
export function IntroMessagePage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ template: string }>(['intro_messages'], '/intro_messages');
  const [template, setTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data) setTemplate(data.template);
  }, [data]);

  if (isLoading) return <PageLoading />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(
      api.put<{ redirect: string; flash: { type: string; message: string } }>('/intro_messages', { template }),
      { invalidate: [['intro_messages']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="いいね時の定型文" back="/profile/settings" />
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <p className="text-[11px] leading-relaxed text-ink-500">
          チャットルームを作成したときに自動で送信される文章です。
          <br />
          <code className="text-brand-700">%name%</code> は相手のニックネームに置き換わります。
          <br />
          空欄で保存すると定型文を削除します。
        </p>
        <textarea
          className="input min-h-40"
          placeholder="%name%さん、はじめまして！よろしくお願いします。"
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
        />
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          保存する
        </button>
      </form>
    </div>
  );
}
