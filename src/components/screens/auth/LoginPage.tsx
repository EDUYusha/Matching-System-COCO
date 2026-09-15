'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from '@/client/navigation';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AN } from '@/lib';
import type { CurrentUser } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore, type RequiredAction } from '@/client/store';
import { Field, Spinner } from '@/components/ui';

/**
 * SessionsController#login_page and #login.
 *
 * `prevPage` stands in for flash[:prev_page]: a visitor bounced here from a
 * protected url returns to it after signing in.
 */
export function LoginPage(): ReactNode {
  const router = useRouter();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const setUser = useAppStore((state) => state.setUser);
  const pushToast = useAppStore((state) => state.pushToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const prevPage = searchParams.get('prev_page') ?? undefined;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{
        user: CurrentUser;
        requiredAction: RequiredAction | null;
        redirect: string;
        flash: { type: 'notice'; message: string };
      }>('/login', { email, password, prevPage });

      setUser(result.user, result.requiredAction);
      await queryClient.invalidateQueries();
      pushToast(result.flash);
      router.replace(result.redirect);
    } catch (error) {
      pushToast(
        error instanceof ApiRequestError
          ? (error.flash ?? { type: 'alert', message: error.message })
          : { type: 'alert', message: 'ログインできませんでした' },
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** SessionsController#sns_login_redirection */
  async function loginWithLine(): Promise<void> {
    try {
      const { url } = await api.get<{ url: string }>('/sns_login_redirection');
      window.location.href = url;
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <p className="text-3xl font-bold tracking-wide text-gold-700">{AN.Short}</p>
        <p className="mt-1 text-xs text-ink-500">{AN.Full}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="メールアドレス">
          <input
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="パスワード">
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          ログイン
        </button>
      </form>

      <button type="button" onClick={loginWithLine} className="btn mt-3 w-full bg-[#06c755] text-white hover:brightness-110">
        LINEでログイン
      </button>

      <div className="mt-7 space-y-2 text-center text-xs">
        <p>
          <Link href="/password_restoration">パスワードをお忘れの方</Link>
        </p>
        <p className="text-ink-500">
          ゲスト登録は <Link href="/register">こちら</Link>
        </p>
        <p className="text-ink-500">
          キャスト登録は <Link href="/cast/new">こちら</Link>
        </p>
      </div>

      <footer className="mt-10 space-x-3 text-center text-[10px] text-ink-500">
        <Link href="/usage_terms">利用規約</Link>
        <Link href="/privacy_policy">プライバシーポリシー</Link>
        <Link href="/trade_terms">特定商取引法</Link>
      </footer>
    </div>
  );
}
