'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from '@/client/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AN, config } from '@/lib';
import type { CurrentUser, UserCard } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore, type RequiredAction } from '@/client/store';
import { Avatar, Field, LevelBadge, Spinner } from '@/components/ui';

/**
 * UsersController#new / #verify / #create — guest signup.
 *
 * The SMS step only appears when the API says it is required
 * (config.require_sms_verification), which is how the Rails flow behaved.
 */
export function SignupPage({ showcase = false }: { showcase?: boolean }): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const setUser = useAppStore((state) => state.setUser);
  const pushToast = useAppStore((state) => state.pushToast);

  const [sns, setSns] = useState<{ hasSns: boolean; nickName: string | null; inviterCode: string | null }>({
    hasSns: false,
    nickName: null,
    inviterCode: null,
  });
  const [newCast, setNewCast] = useState<UserCard[]>([]);

  const [form, setForm] = useState({
    nickName: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    age: '',
    phone: '',
    inviterCode: searchParams.get('inviter_code') ?? '',
    selfPrefectures: '',
    selfIntroduction: '',
  });
  const [smsRequired, setSmsRequired] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // the LINE handshake parks the profile in the session; prefill from it
    void api
      .get<{ hasSns: boolean; nickName: string | null; inviterCode: string | null }>('/sns_pending')
      .then((data) => {
        setSns(data);
        setForm((current) => ({
          ...current,
          nickName: current.nickName || (data.nickName ?? ''),
          inviterCode: current.inviterCode || (data.inviterCode ?? ''),
        }));
      })
      .catch(() => undefined);

    if (showcase) {
      void api.get<{ newUsers: UserCard[] }>('/users/signup').then((data) => setNewCast(data.newUsers)).catch(() => undefined);
    }
  }, [showcase]);

  function update(key: keyof typeof form, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    const payload = {
      ...form,
      age: form.age ? Number(form.age) : null,
      smsVerificationCode: smsCode || null,
    };

    try {
      if (!smsRequired) {
        const verify = await api.post<{ ok: boolean; smsRequired: boolean }>('/users/verify', payload);
        if (verify.smsRequired) {
          setSmsRequired(true);
          pushToast({ type: 'notice', message: 'SMSに認証コードを送信しました。' });
          return;
        }
      }

      const result = await api.post<{
        user: CurrentUser;
        requiredAction: RequiredAction | null;
        redirect: string;
        flash: { type: 'notice'; message: string };
      }>('/users', payload);

      setUser(result.user, result.requiredAction);
      await queryClient.invalidateQueries();
      pushToast(result.flash);
      router.replace(result.redirect);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setErrors(error.details ?? {});
        pushToast(error.flash ?? { type: 'alert', message: error.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold text-brand-700">{AN.Short}</p>
        <h1 className="mt-1 text-sm font-semibold">ゲスト登録</h1>
      </div>

      {showcase && newCast.length ? (
        <section className="mb-6">
          <p className="mb-2 text-xs text-ink-500">今週の新人キャスト</p>
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {newCast.map((cast) => (
              <div key={cast.id} className="w-20 shrink-0 text-center">
                <Avatar src={cast.profilePicUrl} alt={cast.nickName} size="lg" />
                <p className="mt-1 truncate text-[11px]">{cast.nickName}</p>
                <LevelBadge level={cast.level} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <Field label="ニックネーム" error={errors.nick_name}>
          <input className="input" value={form.nickName} onChange={(event) => update('nickName', event.target.value)} required />
        </Field>

        {sns.hasSns ? (
          <p className="rounded-lg border border-[#06c755]/40 bg-[#06c755]/10 px-3 py-2 text-xs text-[#06c755]">
            LINEアカウントと連携済みです。メールアドレスの登録は任意です。
          </p>
        ) : null}

        <Field label={`メールアドレス${sns.hasSns ? '（任意）' : ''}`} error={errors.email}>
          <input
            type="email"
            className="input"
            autoComplete="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            required={!sns.hasSns}
          />
        </Field>

        {form.email ? (
          <>
            <Field label="パスワード（6文字以上）" error={errors.password}>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
              />
            </Field>
            <Field label="パスワード（確認）" error={errors.password_confirmation}>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                value={form.passwordConfirmation}
                onChange={(event) => update('passwordConfirmation', event.target.value)}
              />
            </Field>
          </>
        ) : null}

        <Field label="年齢" error={errors.age ?? errors.birthday} hint="18歳未満はご利用いただけません">
          <input
            type="number"
            min={18}
            max={100}
            className="input"
            value={form.age}
            onChange={(event) => update('age', event.target.value)}
            required
          />
        </Field>

        <Field label="電話番号" error={errors.phone} hint="ハイフンなし">
          <input
            type="tel"
            className="input"
            value={form.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </Field>

        <Field label="対応 都道府県">
          <input
            className="input"
            value={form.selfPrefectures}
            onChange={(event) => update('selfPrefectures', event.target.value)}
          />
        </Field>

        <Field label="自己紹介">
          <textarea
            className="input min-h-24"
            value={form.selfIntroduction}
            onChange={(event) => update('selfIntroduction', event.target.value)}
          />
        </Field>

        <Field
          label="紹介者コード（任意）"
          error={errors.inviter_code}
          hint={`紹介者コードの入力でお試しポイント${config.customer_start_credits_invited}Pを付与します`}
        >
          <input
            className="input"
            value={form.inviterCode}
            onChange={(event) => update('inviterCode', event.target.value)}
          />
        </Field>

        {smsRequired ? (
          <Field label="SMS認証コード" hint="お送りした6桁の数字を入力してください">
            <input
              className="input tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value)}
              required
            />
          </Field>
        ) : null}

        <p className="text-[11px] leading-relaxed text-ink-500">
          登録することで <Link href="/usage_terms">利用規約</Link> と{' '}
          <Link href="/privacy_policy">プライバシーポリシー</Link> に同意したものとみなします。
        </p>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {smsRequired ? '認証して登録する' : '登録する'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-500">
        すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
      </p>
    </div>
  );
}
