'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { ChargePageDto } from '@/lib';
import { numberToCredits, numberToYen } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useAppStore } from '@/client/store';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * FinancialController#charge / #make_charge — buying points.
 *
 * 3-D Secure happens in an iframe the gateway supplies; the issuer posts its
 * result straight to the API's termUrl, so the page polls the card/point state
 * rather than trying to read across origins.
 */
export function ChargePage(): ReactNode {
  const pushToast = useAppStore((state) => state.pushToast);
  const { data, isLoading, refetch } = useApiQuery<ChargePageDto>(['financial', 'charge'], '/financial/charge');

  const [selected, setSelected] = useState<number | null>(null);
  const [threeDs, setThreeDs] = useState<{ iframeUrl: string; md: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!threeDs) return;
    // poll until the callback has booked the purchase
    const started = Date.now();
    const interval = setInterval(() => {
      void refetch();
      if (Date.now() - started > 3 * 60 * 1000) {
        clearInterval(interval);
        setThreeDs(null);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [threeDs, refetch]);

  if (isLoading) return <PageLoading />;

  const hasCard = data?.card?.status === 'valid';

  async function buy(): Promise<void> {
    if (selected === null) return;
    setSubmitting(true);
    try {
      const result = await api.post<{
        iframeUrl: string | null;
        md: string | null;
        flash: { type: 'notice'; message: string };
      }>('/financial/charge', {
        // in production this is the token the gateway's JS collects; the
        // development stub accepts any non-empty value
        axesTokenValue: 'development-token',
        creditAmount: selected,
      });
      pushToast(result.flash);
      if (result.iframeUrl && result.md) setThreeDs({ iframeUrl: result.iframeUrl, md: result.md });
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (threeDs) {
    return (
      <div>
        <PageHeader title="カード認証" back="/financial/charge" />
        <p className="px-4 py-3 text-[11px] text-ink-500">
          カード発行会社の認証画面です。完了すると自動的にポイントが反映されます。
        </p>
        <iframe src={threeDs.iframeUrl} title="3-D Secure" className="h-[520px] w-full border-0 bg-white" />
        <div className="px-4 py-4">
          <button type="button" className="btn-secondary w-full" onClick={() => setThreeDs(null)}>
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="ポイントを購入"
        back="/user/settings"
        subtitle={`残高 ${numberToCredits(data?.creditBalance ?? 0)}`}
      />

      {!hasCard ? (
        <div className="m-4 card border-red-500/40 bg-red-950/30">
          <p className="text-xs text-red-200">
            ポイントの購入にはクレジットカードの登録が必要です。
          </p>
          <Link href="/financial/credit_card" className="btn-primary mt-3 w-full no-underline">
            カードを登録する
          </Link>
        </div>
      ) : null}

      <ul className="divide-y divide-ink-200 border-y border-ink-200">
        {data?.steps.map((step) => (
          <li key={step.credits}>
            <button
              type="button"
              onClick={() => setSelected(step.credits)}
              className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                selected === step.credits ? 'bg-brand-100' : ''
              }`}
            >
              <span className={`text-xl ${selected === step.credits ? 'text-brand-700' : 'text-ink-600'}`}>
                {selected === step.credits ? '◉' : '○'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {numberToCredits(step.total)}
                  {step.bonus > 0 ? (
                    <span className="ml-1 text-[11px] text-emerald-600">（ボーナス {step.bonus}P 込）</span>
                  ) : null}
                </span>
                <span className="block text-[11px] text-ink-500">{numberToYen(step.yen)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="px-4 py-5">
        <button
          type="button"
          className="btn-primary w-full"
          disabled={selected === null || submitting || !hasCard}
          onClick={() => void buy()}
        >
          {submitting ? <Spinner /> : null}
          購入する
        </button>
        <p className="mt-2 text-[11px] text-ink-500">
          1,000ポイント = {numberToYen(1100)}（税込）。購入後のポイントの返金はできません。
        </p>
      </div>
    </div>
  );
}
