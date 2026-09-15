'use client';

import { useState, type ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';
import { UserTile } from '@/components/UserCardRow';

/**
 * UsersController#cast_recommendations / #follow_recommendation.
 *
 * The guest counterpart, which requires at least seven picks — the API enforces
 * that, as the original did.
 */
export function CastRecommendationsPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ cast: UserCard[] }>(
    ['users', 'cast_recommendations'],
    '/users/cast_recommendations',
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;

  async function submit(): Promise<void> {
    setSubmitting(true);
    await run(
      api.post<{ redirect: string }>('/users/follow_recommendation', { castIds: selected }),
      { invalidate: [['conversations']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="好みのキャストを選ぶ" />
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        お好みのキャストを7人以上選んでください。選んだキャストとのチャットルームが作成されます。
      </p>

      <div className="grid grid-cols-3 gap-3 px-4 pb-28">
        {data?.cast.map((candidate) => (
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
          disabled={submitting || selected.length < 7}
          onClick={() => void submit()}
        >
          {submitting ? <Spinner /> : null}
          {selected.length < 7 ? `あと${7 - selected.length}人選んでください` : `${selected.length}名を選んで進む`}
        </button>
      </div>
    </div>
  );
}
