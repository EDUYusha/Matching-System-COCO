'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { RouletteRollDto } from '@/lib';
import { numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * StickersController#roulette / #pay_for_prize — the gift gacha.
 *
 * The reel is built server-side and kept pending, so the winner is fixed before
 * the animation starts and reloading cannot reroll it. `outcome[0]` is the winner.
 */
export function RoulettePage(): ReactNode {
  const { id, rouletteId } = useParams<{ id: string; rouletteId: string }>();
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ roll: RouletteRollDto; conversationId: number }>(
    ['roulette', id, rouletteId],
    `/conversations/${id}/stickers/roulette/${rouletteId}`,
  );

  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!spinning || !data) return;
    // cycle the reel, then settle on index 0, which is the winner
    const interval = setInterval(() => {
      setHighlight((current) => (current + 1) % data.roll.outcome.length);
    }, 110);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setHighlight(0);
      setSpinning(false);
      setRevealed(true);
    }, 2400);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [spinning, data]);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const winner = data.roll.outcome[0];

  async function payForPrize(): Promise<void> {
    setPaying(true);
    await run(
      api.post<{ redirect: string }>(`/conversations/${id}/stickers/roulette/${rouletteId}/pay_for_prize`),
      { invalidate: [['conversation', Number(id)], ['me']] },
    );
    setPaying(false);
  }

  return (
    <div>
      <PageHeader title="ギフトルーレット" back={`/conversations/${id}`} />

      <div className="px-4 py-5 text-center">
        <p className="text-xs text-ink-500">
          1回 <span className="font-bold text-brand-700">{numberToCredits(data.roll.fee)}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4">
        {data.roll.outcome.map((entry, index) => (
          <div
            key={`${entry.id}-${index}`}
            className={`rounded-xl border p-3 text-center transition ${
              (spinning && highlight === index) || (revealed && index === 0)
                ? 'border-brand-500 bg-brand-100 scale-105'
                : 'border-ink-200 bg-white'
            }`}
          >
            <img src={entry.pictureUrl} alt={entry.name} className="mx-auto h-20 w-20 object-contain" />
            <p className="mt-1 text-[11px]">{entry.name}</p>
          </div>
        ))}
      </div>

      <div className="px-4 py-6">
        {!revealed ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => setSpinning(true)}
            disabled={spinning}
          >
            {spinning ? <Spinner /> : null}
            {spinning ? '抽選中…' : 'ルーレットを回す'}
          </button>
        ) : (
          <>
            <div className="card mb-3 border-brand-300 bg-brand-50 text-center">
              <p className="text-xs text-ink-700">当選</p>
              <img src={winner?.pictureUrl} alt={winner?.name} className="mx-auto h-24 w-24 object-contain" />
              <p className="text-sm font-bold text-brand-700">{winner?.name}</p>
            </div>
            <button type="button" className="btn-primary w-full" onClick={() => void payForPrize()} disabled={paying}>
              {paying ? <Spinner /> : null}
              {numberToCredits(data.roll.fee)}を支払ってプレゼントする
            </button>
            <p className="mt-2 text-center text-[11px] text-ink-500">
              支払うとキャストにギフトが贈られます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
