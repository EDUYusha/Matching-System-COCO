'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { Field, PageHeader, Spinner } from '@/components/ui';

/**
 * UsersController#edit_phone_number / #phone_number_verification /
 * #verify_and_update_phone_number — the two-step SMS verification.
 */
export function PhoneNumberPage(): ReactNode {
  const user = useCurrentUser();
  const { run } = useAction();
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [submitting, setSubmitting] = useState(false);

  async function sendCode(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    const result = await run(api.post<{ ok: boolean }>('/user/phone_number_verification', { phone }));
    if (result) setStep('code');
    setSubmitting(false);
  }

  async function verify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(
      api.patch<{ redirect: string; flash: { type: string; message: string } }>('/user/phone_number', {
        smsVerificationCode: code,
      }),
      { invalidate: [['me']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="電話番号" back="/user/settings" />

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="space-y-4 px-4 py-4">
          <p className="text-[11px] leading-relaxed text-ink-500">
            セキュリティ強化のため、電話番号でのSMS認証をお願いしております。
          </p>
          <Field label="電話番号" hint="ハイフンなしで入力してください">
            <input
              type="tel"
              className="input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            認証コードを送信
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4 px-4 py-4">
          <p className="text-[11px] text-ink-500">{phone} に6桁の認証コードを送信しました。</p>
          <Field label="認証コード">
            <input
              className="input tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            認証する
          </button>
          <button type="button" className="btn-ghost w-full text-xs" onClick={() => setStep('phone')}>
            番号を入力し直す
          </button>
        </form>
      )}
    </div>
  );
}
