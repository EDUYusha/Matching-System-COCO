'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction } from '@/client/hooks';
import { useAppStore, useCurrentUser } from '@/client/store';
import { Field, PageHeader, Spinner } from '@/components/ui';

/** UsersController#add_login_method / #add_email / #add_sns. */
export function AddLoginMethodPage(): ReactNode {
  const user = useCurrentUser();
  const { run } = useAction();
  const pushToast = useAppStore((state) => state.pushToast);
  const [form, setForm] = useState({ email: '', password: '', passwordConfirmation: '' });
  const [submitting, setSubmitting] = useState(false);

  async function addEmail(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(api.post<{ redirect: string; flash: { type: string; message: string } }>('/user/add_email', form), {
      invalidate: [['me']],
    });
    setSubmitting(false);
  }

  async function linkLine(): Promise<void> {
    try {
      const { url } = await api.get<{ url: string }>('/sns_login_redirection?add_login_method=1');
      window.location.href = url;
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    }
  }

  return (
    <div>
      <PageHeader title="ログイン方法を追加" back="/user/settings" />

      <section>
        <h2 className="section-title">現在のログイン方法</h2>
        <ul className="divide-y divide-ink-200 border-y border-ink-200 text-sm">
          <li className="flex items-center gap-2 px-4 py-3">
            <span className="flex-1">メールアドレス</span>
            <span className="text-[11px] text-ink-500">{user?.email ?? '未設定'}</span>
          </li>
          <li className="flex items-center gap-2 px-4 py-3">
            <span className="flex-1">LINE</span>
            <span className="text-[11px] text-ink-500">{user?.snsId ? '連携済み' : '未連携'}</span>
          </li>
        </ul>
      </section>

      {!user?.snsId ? (
        <div className="px-4 py-4">
          <button type="button" className="btn w-full bg-[#06c755] text-white" onClick={() => void linkLine()}>
            LINEアカウントを連携する
          </button>
        </div>
      ) : null}

      {!user?.email ? (
        <form onSubmit={addEmail} className="space-y-4 px-4 py-4">
          <h2 className="text-sm font-semibold">メールアドレスを追加</h2>
          <Field label="メールアドレス">
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
          </Field>
          <Field label="パスワード（6文字以上）">
            <input
              type="password"
              className="input"
              minLength={6}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </Field>
          <Field label="パスワード（確認）">
            <input
              type="password"
              className="input"
              value={form.passwordConfirmation}
              onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
              required
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            追加する
          </button>
        </form>
      ) : null}
    </div>
  );
}
