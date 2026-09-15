'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AN } from '@/lib';
import { api, ApiRequestError } from '@/client/admin-api';
import { useAdminStore, type AdminUser } from '@/client/admin-store';
import { Field, Spinner } from '@/components/admin/ui';

/** The admin login, against the `admins` table. */
export function LoginPage(): ReactNode {
  const router = useRouter();
  const setAdmin = useAdminStore((state) => state.setAdmin);
  const pushToast = useAdminStore((state) => state.pushToast);

  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{ admin: AdminUser }>('/admin/login', { loginName, password });
      setAdmin(result.admin);
      router.replace('/admin');
    } catch (error) {
      pushToast(
        error instanceof ApiRequestError
          ? { type: 'alert', message: error.message }
          : { type: 'alert', message: 'ログインできませんでした' },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-bold text-brand-600">{AN.Short} 管理画面</h1>
        <p className="mb-5 text-[12px] text-slate-500">管理者アカウントでログインしてください。</p>

        <div className="space-y-3">
          <Field label="ログイン名">
            <input className="input" value={loginName} onChange={(event) => setLoginName(event.target.value)} required />
          </Field>
          <Field label="パスワード">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
        </div>

        <button type="submit" className="btn-primary mt-5 w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          ログイン
        </button>
      </form>
    </div>
  );
}
