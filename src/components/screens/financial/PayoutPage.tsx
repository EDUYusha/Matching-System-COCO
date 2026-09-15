'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { PayoutPageDto } from '@/lib';
import { lLooseDate, numberToCredits, numberToYen } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Field, PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * FinancialController#payout / #record_payout / #hold_payout.
 *
 * Two paths coexist. The ordinary application pays on the 25th and may only draw
 * on credits earned *before* this month; "すぐ出金" takes the whole balance within
 * three business days for a percentage fee.
 */
export function PayoutPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading, refetch } = useApiQuery<PayoutPageDto>(['financial', 'payout'], '/financial/payout');

  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [specifiedNet, setSpecifiedNet] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const hasPending = data.pendingRequests.length > 0;

  async function apply(): Promise<void> {
    setSubmitting(true);
    await run(
      api.post<{ flash: { type: string; message: string } }>('/financial/payout', {
        payoutType: mode,
        ...(mode === 'partial' ? { specifiedNetAmount: Number(specifiedNet) } : {}),
      }),
      { invalidate: [['financial', 'payout'], ['me']] },
    );
    setSubmitting(false);
    await refetch();
  }

  async function applyFast(): Promise<void> {
    if (!window.confirm('すぐ出金を申請しますか？ 手数料が高くなります。')) return;
    setSubmitting(true);
    await run(api.post<{ flash: { type: string; message: string } }>('/financial/payout', { fastPayout: true }), {
      invalidate: [['financial', 'payout'], ['me']],
    });
    setSubmitting(false);
    await refetch();
  }

  async function hold(): Promise<void> {
    if (!window.confirm('ポイントを保留しますか？ 運営が解除した後に振込処理されます。')) return;
    setSubmitting(true);
    await run(api.post<{ flash: { type: string; message: string } }>('/financial/payout_hold'), {
      invalidate: [['financial', 'payout'], ['me']],
    });
    setSubmitting(false);
    await refetch();
  }

  return (
    <div>
      <PageHeader title="出金申請" back="/user/settings" />

      <div className="m-4 card">
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <dt className="text-ink-500">保有ポイント</dt>
            <dd className="font-semibold">{numberToCredits(data.creditBalance)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">当月獲得分</dt>
            <dd>{numberToCredits(data.currentMonthCredits)}</dd>
          </div>
          <div className="flex justify-between border-t border-ink-200 pt-1.5">
            <dt className="text-ink-500">出金可能ポイント</dt>
            <dd className="text-base font-bold text-brand-700">{numberToCredits(data.payableBalance)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
          当月に獲得したポイントは翌月以降に出金できます。振込手数料は{numberToYen(data.baseFee)}、
          振込金額が{numberToYen(data.minNetAmount)}未満の場合は申請できません。
        </p>
      </div>

      {!data.bankAccount ? (
        <div className="m-4 card border-red-500/40 bg-red-950/30">
          <p className="text-xs text-red-200">出金には振込先口座の登録が必要です。</p>
          <Link href="/financial/bank_account" className="btn-primary mt-3 w-full no-underline">
            口座を登録する
          </Link>
        </div>
      ) : (
        <div className="m-4 card">
          <p className="text-[11px] text-ink-500">振込先</p>
          <p className="mt-0.5 text-xs">
            {data.bankAccount.bankName} {data.bankAccount.branchName} / {data.bankAccount.accountType}{' '}
            {data.bankAccount.accountNumber}
          </p>
          <p className="text-xs text-ink-500">{data.bankAccount.holderName}</p>
          <Link href="/financial/bank_account" className="mt-2 inline-block text-[11px]">
            変更する
          </Link>
        </div>
      )}

      {hasPending ? (
        <section>
          <h2 className="section-title">申請中</h2>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {data.pendingRequests.map((request) => (
              <li key={request.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="badge bg-brand-100 text-brand-700">
                    {request.status === 'on_hold' ? '保留中' : request.fastPayout ? 'すぐ出金' : '申請済み'}
                  </span>
                  <span className="text-sm font-bold">{numberToYen(request.netAmount)}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-500">
                  {numberToCredits(request.creditAmount)}・手数料 {numberToYen(request.fee)}・振込予定{' '}
                  {lLooseDate(request.scheduledPayoutOn)}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-[11px] text-ink-500">
            処理が完了すると次の申請ができます。変更が必要な場合は運営局へご連絡ください。
          </p>
        </section>
      ) : (
        <>
          <h2 className="section-title">通常申請（{lLooseDate(data.scheduledDate)} 振込予定）</h2>
          <div className="space-y-3 px-4 pb-4">
            <div className="flex gap-2">
              <button
                type="button"
                className={`badge flex-1 py-2 ${mode === 'full' ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
                onClick={() => setMode('full')}
              >
                全額
              </button>
              <button
                type="button"
                className={`badge flex-1 py-2 ${mode === 'partial' ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
                onClick={() => setMode('partial')}
              >
                金額を指定
              </button>
            </div>

            {mode === 'partial' ? (
              <Field
                label="振込希望金額（円）"
                hint={`${numberToYen(data.minNetAmount)}以上、最大 ${numberToYen(Math.max(data.payableBalance - data.baseFee, 0))}`}
              >
                <input
                  type="number"
                  min={data.minNetAmount}
                  step={1000}
                  className="input"
                  value={specifiedNet}
                  onChange={(event) => setSpecifiedNet(event.target.value)}
                />
              </Field>
            ) : (
              <dl className="card space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-500">申請ポイント</dt>
                  <dd>{numberToCredits(data.payableBalance)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">振込手数料</dt>
                  <dd>−{numberToYen(data.costs.fee)}</dd>
                </div>
                <div className="flex justify-between border-t border-ink-200 pt-1">
                  <dt className="text-ink-500">振込金額</dt>
                  <dd className="font-bold text-brand-700">{numberToYen(Math.max(data.costs.netOut, 0))}</dd>
                </div>
              </dl>
            )}

            <button
              type="button"
              className="btn-primary w-full"
              disabled={submitting || !data.bankAccount || data.payableBalance <= 0}
              onClick={() => void apply()}
            >
              {submitting ? <Spinner /> : null}
              出金を申請する
            </button>
          </div>

          <h2 className="section-title">すぐ出金（{lLooseDate(data.fastScheduledDate)} 振込予定）</h2>
          <div className="space-y-3 px-4 pb-4">
            <dl className="card space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-500">申請ポイント</dt>
                <dd>{numberToCredits(data.creditBalance)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">手数料</dt>
                <dd>−{numberToYen(data.fastCosts.fee)}</dd>
              </div>
              <div className="flex justify-between border-t border-ink-200 pt-1">
                <dt className="text-ink-500">振込金額</dt>
                <dd className="font-bold text-brand-700">{numberToYen(Math.max(data.fastCosts.netOut, 0))}</dd>
              </div>
            </dl>
            <p className="text-[10px] text-ink-500">
              すぐ出金は当月獲得分も含む全残高が対象です。手数料は10%＋{numberToYen(data.baseFee)}です。
            </p>
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={submitting || !data.bankAccount || data.creditBalance <= 0}
              onClick={() => void applyFast()}
            >
              すぐ出金を申請する
            </button>
          </div>

          <div className="px-4 pb-8">
            <button type="button" className="btn-ghost w-full text-xs" disabled={submitting} onClick={() => void hold()}>
              ポイントを保留する（振込は運営の解除後）
            </button>
          </div>
        </>
      )}
    </div>
  );
}
