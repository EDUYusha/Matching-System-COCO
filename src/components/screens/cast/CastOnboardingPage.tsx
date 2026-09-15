'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ACCESS_LEVEL_RANKING } from '@/lib';
import { useCurrentUser } from '@/client/store';
import { PageHeader, PageLoading } from '@/components/ui';

/**
 * CastController#restricted — shows a partially onboarded cast where they are.
 *
 * The ladder is User::ACCESS_LEVEL_RANKING: a cast climbs from `unauthorized` to
 * `full`, and only `full` unlocks orders, search, posting and payouts.
 */
const STEPS: Array<{ level: string; label: string; hint: string; to?: string }> = [
  { level: 'unauthorized', label: 'アカウント作成', hint: '完了しました' },
  {
    level: 'picture_uploaded',
    label: '身分証明書のアップロード',
    hint: '顔写真付きの身分証明書をご提出ください',
    to: '/cast/identity_check',
  },
  { level: 'interview_date_pending', label: '面接日の調整', hint: '運営局からご連絡します' },
  { level: 'interview_pending', label: '面接', hint: '運営局との面接をお願いします' },
  { level: 'contract_pending', label: '同意書の提出', hint: '同意書をご提出ください', to: '/cast/agreement' },
  { level: 'contract_accepted', label: '運営局の確認', hint: '確認が完了するまでお待ちください' },
  { level: 'full', label: '本登録完了', hint: 'オーダーへのエントリーができます' },
];

export function CastOnboardingPage(): ReactNode {
  const user = useCurrentUser();
  if (!user) return <PageLoading />;

  const currentIndex = ACCESS_LEVEL_RANKING.indexOf(user.accessLevel);

  if (user.accessLevel === 'rejected' || user.accessLevel === 'ceased') {
    return (
      <div>
        <PageHeader title="アカウント" back="/user/settings" />
        <div className="px-6 py-12 text-center">
          <p className="text-4xl">🔒</p>
          <p className="mt-3 text-sm text-red-200">このアカウントは現在ご利用いただけません。</p>
          <p className="mt-1 text-[11px] text-ink-500">お問い合わせは運営局までご連絡ください。</p>
          <Link href="/conversations" className="btn-secondary mt-6 w-full no-underline">
            運営局に問い合わせる
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="本登録の進捗" back="/user/settings" />
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        本登録が完了すると、オーダーへのエントリーと出金が可能になります。
      </p>

      <ol className="px-4 pb-8">
        {STEPS.map((step) => {
          const stepIndex = ACCESS_LEVEL_RANKING.indexOf(step.level as never);
          const done = currentIndex >= stepIndex;
          const current = currentIndex === stepIndex;

          return (
            <li key={step.level} className="flex gap-3 border-l-2 border-ink-200 pb-5 pl-4 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`-ml-[26px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      done ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-paper-100 text-ink-500'
                    }`}
                  >
                    {done ? '✓' : stepIndex - 1}
                  </span>
                  <p className={`text-sm ${current ? 'font-bold text-brand-700' : done ? 'text-ink-700' : 'text-ink-500'}`}>
                    {step.label}
                  </p>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500">{step.hint}</p>
                {current && step.to ? (
                  <Link href={step.to} className="btn-primary mt-2 px-3 py-1.5 text-xs no-underline">
                    進める
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
