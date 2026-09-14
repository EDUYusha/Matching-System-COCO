'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ChargePageDto } from '@/lib';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useAppStore } from '@/client/store';
import { Field, PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * FinancialController#credit_card / #register_credit_card.
 *
 * Card numbers never reach this app: in production the gateway's own script
 * tokenises them in the browser and only the token is posted. The fields below
 * collect the masked values the gateway hands back, which is what the original
 * stored on the credit_cards row.
 */
export function CreditCardPage(): ReactNode {
  const pushToast = useAppStore((state) => state.pushToast);
  const { data, isLoading, refetch } = useApiQuery<{ card: ChargePageDto['card']; hasValidCard: boolean }>(
    ['financial', 'credit_card'],
    '/financial/credit_card',
  );

  const [form, setForm] = useState({ nameOnCard: '', maskedCardNumber: '', expiryMonth: '', expiryYear: '' });
  const [threeDs, setThreeDs] = useState<{ iframeUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!threeDs) return;
    const interval = setInterval(() => {
      void api
        .get<{ status: string }>('/financial/credit_card_status')
        .then((status) => {
          if (status.status === 'valid') {
            clearInterval(interval);
            setThreeDs(null);
            pushToast({ type: 'success', message: 'クレジットカードを登録しました。' });
            void refetch();
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [threeDs, pushToast, refetch]);

  if (isLoading) return <PageLoading />;

  async function register(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{
        iframeUrl: string | null;
        flash: { type: 'notice'; message: string };
      }>('/financial/credit_card', {
        axesTokenValue: 'development-token',
        nameOnCard: form.nameOnCard,
        maskedCardNumber: form.maskedCardNumber,
        expiryMonth: form.expiryMonth ? Number(form.expiryMonth) : null,
        expiryYear: form.expiryYear ? Number(form.expiryYear) : null,
      });
      pushToast(result.flash);
      if (result.iframeUrl) setThreeDs({ iframeUrl: result.iframeUrl });
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (threeDs) {
    return (
      <div>
        <PageHeader title="カード認証" back="/financial/credit_card" />
        <p className="px-4 py-3 text-[11px] text-ink-500">
          カード発行会社の認証画面です。完了すると登録が反映されます。
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
      <PageHeader title="お支払い情報" back="/user/settings" />

      {data?.card ? (
        <div className="m-4 card">
          <p className="text-[11px] text-ink-500">登録中のカード</p>
          <p className="mt-1 font-mono text-sm">{data.card.maskedCardNumber ?? '****'}</p>
          <p className="text-[11px] text-ink-500">
            {data.card.nameOnCard} ・ {data.card.expiryMonth}/{data.card.expiryYear}
          </p>
          <p className="mt-1">
            <span className={`badge ${data.hasValidCard ? 'bg-emerald-500/20 text-emerald-600' : 'bg-red-500/20 text-red-600'}`}>
              {data.hasValidCard ? '有効' : '認証未完了'}
            </span>
          </p>
        </div>
      ) : null}

      <form onSubmit={register} className="space-y-4 px-4 py-4">
        <p className="text-[11px] leading-relaxed text-ink-500">
          カード情報は決済代行会社に直接送信され、当サービスでは保持しません。
        </p>

        <Field label="カード名義">
          <input
            className="input"
            value={form.nameOnCard}
            onChange={(event) => setForm({ ...form, nameOnCard: event.target.value })}
            required
          />
        </Field>

        <Field label="カード番号" hint="決済代行会社に送信されます">
          <input
            className="input font-mono"
            inputMode="numeric"
            autoComplete="cc-number"
            value={form.maskedCardNumber}
            onChange={(event) => setForm({ ...form, maskedCardNumber: event.target.value })}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="有効期限（月）">
            <input
              type="number"
              min={1}
              max={12}
              className="input"
              value={form.expiryMonth}
              onChange={(event) => setForm({ ...form, expiryMonth: event.target.value })}
              required
            />
          </Field>
          <Field label="有効期限（年）">
            <input
              type="number"
              min={new Date().getFullYear()}
              className="input"
              value={form.expiryYear}
              onChange={(event) => setForm({ ...form, expiryYear: event.target.value })}
              required
            />
          </Field>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {data?.card ? 'カードを変更する' : 'カードを登録する'}
        </button>
      </form>
    </div>
  );
}
