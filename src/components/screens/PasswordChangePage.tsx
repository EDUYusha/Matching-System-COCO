'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction } from '@/client/hooks';
import { Field, PageHeader, Spinner } from '@/components/ui';

/** UsersController#edit_password / #update_password. */
export function PasswordChangePage(): ReactNode {
  const { run } = useAction();
  const [form, setForm] = useState({ currentPassword: '', password: '', passwordConfirmation: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(api.post<{ redirect: string; flash: { type: string; message: string } }>('/user/password', form));
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="パスワード変更" back="/user/settings" />
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <Field label="現在のパスワード">
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
            required
          />
        </Field>
        <Field label="新しいパスワード（6文字以上）">
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={6}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </Field>
        <Field label="新しいパスワード（確認）">
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={form.passwordConfirmation}
            onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })}
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
