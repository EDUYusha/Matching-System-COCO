'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from '@/client/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrentUser } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore, type RequiredAction } from '@/client/store';
import { Spinner } from '@/components/ui';

/**
 * SessionsController#sns_login_return, the screen half.
 *
 * /api/sns_callback sends the member here with the `code` and `state` LINE
 * returned; this posts them to the endpoint that exchanges them, then goes
 * where it says — the member's home if they already had an account, the signup
 * form if the LINE profile is new.
 *
 * There was no screen at this path at all, so the endpoint had no caller.
 */
export function SnsLoginReturnPage(): ReactNode {
  const router = useRouter();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const setUser = useAppStore((state) => state.setUser);
  const pushToast = useAppStore((state) => state.pushToast);

  const [failed, setFailed] = useState<string | null>(null);
  // StrictMode mounts twice in development, and an auth code is single-use
  const started = useRef(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!code || !state) {
      setFailed('LINEからの応答が不正です。');
      return;
    }

    void (async () => {
      try {
        const result = await api.post<{
          user?: CurrentUser;
          requiredAction?: RequiredAction | null;
          redirect?: string;
          flash?: { type: 'notice'; message: string };
        }>('/sns_login_return', { code, state });

        if (result.user) {
          setUser(result.user, result.requiredAction ?? null);
          await queryClient.invalidateQueries();
        }
        if (result.flash) pushToast(result.flash);
        router.replace(result.redirect ?? '/home');
      } catch (error) {
        setFailed(
          error instanceof ApiRequestError
            ? error.message
            : 'LINEログインを完了できませんでした。',
        );
      }
    })();
  }, [code, state, router, queryClient, setUser, pushToast]);

  if (failed) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-red-600">{failed}</p>
        <Link href="/login" className="btn-secondary mt-6 w-full no-underline">
          ログイン画面に戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner />
      <p className="text-xs text-ink-500">LINEログインを確認しています…</p>
    </div>
  );
}
