'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore } from '@/client/store';
import { useApiQuery } from '@/client/hooks';
import { Field, PageLoading, Spinner } from '@/components/ui';

/** SessionsController#password_restoration / #restore_password. */
export function PasswordRestorationPage(): ReactNode {
  const router = useRouter();
  const pushToast = useAppStore((state) => state.pushToast);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{ redirect: string; flash: { type: 'success'; message: string } }>(
        '/restore_password',
        { email },
      );
      pushToast(result.flash);
      router.push(result.redirect);
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-1 text-lg font-bold">パスワード再設定</h1>
      <p className="mb-6 text-xs text-ink-500">
        ご登録のメールアドレスに再設定用のリンクをお送りします。
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="メールアドレス">
          <input type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          送信する
        </button>
      </form>
      <p className="mt-6 text-center text-xs">
        <Link href="/login">ログインに戻る</Link>
      </p>
    </div>
  );
}

/** SessionsController#password_reset / #reset_password. */
export function PasswordResetPage(): ReactNode {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const pushToast = useAppStore((state) => state.pushToast);

  const { data, isLoading, error } = useApiQuery<{ ok: boolean; email: string | null }>(
    ['password_reset', token],
    `/password_reset/${token}`,
  );

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;
  if (error) return null; // useApiQuery already redirected with the flash

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{ redirect: string; flash: { type: 'notice'; message: string } }>(
        '/reset_password',
        { email: data?.email, password, passwordConfirmation, restorationToken: token },
      );
      pushToast(result.flash);
      router.push(result.redirect);
    } catch (caught) {
      pushToast(
        caught instanceof ApiRequestError
          ? (caught.flash ?? { type: 'alert', message: caught.message })
          : { type: 'alert', message: '再設定できませんでした' },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-1 text-lg font-bold">新しいパスワード</h1>
      <p className="mb-6 text-xs text-ink-500">{data?.email}</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="新しいパスワード（6文字以上）">
          <input
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </Field>
        <Field label="新しいパスワード（確認）">
          <input
            type="password"
            className="input"
            value={passwordConfirmation}
            onChange={(event) => setPasswordConfirmation(event.target.value)}
            required
          />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          更新する
        </button>
      </form>
    </div>
  );
}
