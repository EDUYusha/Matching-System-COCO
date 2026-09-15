'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from '@/client/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AN } from '@/lib';
import type { CurrentUser } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore, type RequiredAction } from '@/client/store';
import { Field, Spinner } from '@/components/ui';

/**
 * CastController#new / #create.
 *
 * A new cast is created unauthorized and hidden (public_profile false), on the
 * configured starting level with a 0 payback rate; the onboarding screens then
 * walk them up to `full`.
 */
export function CastSignupPage({ showcase = false }: { showcase?: boolean }): ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const setUser = useAppStore((state) => state.setUser);
  const pushToast = useAppStore((state) => state.pushToast);

  const [businessAreas, setBusinessAreas] = useState<Array<{ id: number; name: string }>>([]);
  const [hasSns, setHasSns] = useState(false);
  const [form, setForm] = useState({
    nickName: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    age: '',
    phone: '',
    businessAreaId: '',
    inviterCode: searchParams.get('inviter_code') ?? '',
    selfPrefectures: '',
    birthdayPublished: '1',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void api
      .get<{ hasSns: boolean; nickName: string | null; inviterCode: string | null }>('/sns_pending')
      .then((data) => {
        setHasSns(data.hasSns);
        setForm((current) => ({
          ...current,
          nickName: current.nickName || (data.nickName ?? ''),
          inviterCode: current.inviterCode || (data.inviterCode ?? ''),
        }));
      })
      .catch(() => undefined);

    // the signup form needs the branch list, which is public reference data
    void api
      .get<{ businessAreas: Array<{ id: number; name: string }> }>('/business_areas')
      .then((data) => setBusinessAreas(data.businessAreas))
      .catch(() => undefined);
  }, []);

  function update(key: keyof typeof form, value: string): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const result = await api.post<{
        user: CurrentUser;
        requiredAction: RequiredAction | null;
        redirect: string;
        flash: { type: 'notice'; message: string };
      }>('/cast', {
        ...form,
        age: form.age ? Number(form.age) : null,
        businessAreaId: Number(form.businessAreaId),
        birthdayPublished: Number(form.birthdayPublished),
      });

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
        <h1 className="mt-1 text-sm font-semibold">キャスト登録</h1>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          ご登録後、顔写真付きの身分証明書をご提出いただくと本登録となります。
        </p>
      </div>

      {showcase ? (
        <div className="card mb-6 text-xs leading-relaxed text-ink-700">
          <p className="mb-1 font-semibold text-brand-700">キャストとして活動するには</p>
          <ol className="list-inside list-decimal space-y-1">
            <li>アカウントを作成</li>
            <li>顔写真付きの身分証明書をアップロード</li>
            <li>運営局による面接</li>
            <li>同意書の提出</li>
          </ol>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <Field label="ニックネーム" error={errors.nick_name}>
          <input className="input" value={form.nickName} onChange={(event) => update('nickName', event.target.value)} required />
        </Field>

        {hasSns ? (
          <p className="rounded-lg border border-[#06c755]/40 bg-[#06c755]/10 px-3 py-2 text-xs text-[#06c755]">
            LINEアカウントと連携済みです。
          </p>
        ) : null}

        <Field label={`メールアドレス${hasSns ? '（任意）' : ''}`} error={errors.email}>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            required={!hasSns}
          />
        </Field>

        {form.email ? (
          <>
            <Field label="パスワード（6文字以上）" error={errors.password}>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
              />
            </Field>
            <Field label="パスワード（確認）" error={errors.password_confirmation}>
              <input
                type="password"
                className="input"
                value={form.passwordConfirmation}
                onChange={(event) => update('passwordConfirmation', event.target.value)}
              />
            </Field>
          </>
        ) : null}

        <Field label="年齢" error={errors.age ?? errors.birthday}>
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

        <Field label="年齢の公開">
          <select
            className="input"
            value={form.birthdayPublished}
            onChange={(event) => update('birthdayPublished', event.target.value)}
          >
            <option value="1">公開する</option>
            <option value="0">公開しない</option>
          </select>
        </Field>

        <Field label="電話番号" error={errors.phone} hint="ハイフンなし・キャストは必須です">
          <input type="tel" className="input" value={form.phone} onChange={(event) => update('phone', event.target.value)} required />
        </Field>

        <Field label="支店">
          <select
            className="input"
            value={form.businessAreaId}
            onChange={(event) => update('businessAreaId', event.target.value)}
            required
          >
            {/* collection_select's include_blank, verbatim */}
            <option value="">東京・大阪を選択してください</option>
            {businessAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="対応 都道府県">
          <input
            className="input"
            value={form.selfPrefectures}
            onChange={(event) => update('selfPrefectures', event.target.value)}
          />
        </Field>

        <Field label="紹介者コード（任意）" error={errors.inviter_code}>
          <input className="input" value={form.inviterCode} onChange={(event) => update('inviterCode', event.target.value)} />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-500">
          登録することで <Link href="/usage_terms">利用規約</Link> と{' '}
          <Link href="/privacy_policy">プライバシーポリシー</Link> に同意したものとみなします。
        </p>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          登録する
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-500">
        すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
      </p>
    </div>
  );
}
