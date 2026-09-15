'use client';

import { useState, type ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';
import { UserTile } from '@/components/UserCardRow';

/**
 * CastController#customer_recommendations / #follow_recommendation.
 *
 * A one-off step a new cast must complete: picking guests opens a chat room with
 * each and sets customers_selected, which is what lifts the redirect gate.
 */
export function CustomerRecommendationsPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ users: UserCard[] }>(
    ['cast', 'customer_recommendations'],
    '/cast/customer_recommendations',
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;

  async function submit(): Promise<void> {
    setSubmitting(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/cast/follow_recommendation', {
        castIds: selected,
      }),
      { invalidate: [['me'], ['conversations']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="気になるゲストを選ぶ" />
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        気になるゲストを選ぶと、チャットルームが作成されます。選んだ方にはご挨拶が届きます。
      </p>

      <div className="grid grid-cols-3 gap-3 px-4 pb-28">
        {data?.users.map((candidate) => (
          <UserTile
            key={candidate.id}
            user={candidate}
            selected={selected.includes(candidate.id)}
            onToggle={() =>
              setSelected(
                selected.includes(candidate.id)
                  ? selected.filter((id) => id !== candidate.id)
                  : [...selected, candidate.id],
              )
            }
          />
        ))}
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-app -translate-x-1/2 border-t border-ink-200 bg-paper-100/90 p-4 backdrop-blur">
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || selected.length === 0}
          onClick={() => void submit()}
        >
          {submitting ? <Spinner /> : null}
          {selected.length}名を選んで進む
        </button>
      </div>
    </div>
  );
}
