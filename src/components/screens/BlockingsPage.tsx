'use client';

import type { ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { EmptyState, PageHeader, PageLoading } from '@/components/ui';
import { UserCardRow } from '@/components/UserCardRow';

/** UsersController#blockings / #destroy_blocking. */
export function BlockingsPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading, refetch } = useApiQuery<{
    blockings: Array<{ id: number; createdAt: string; target: UserCard }>;
  }>(['user', 'blockings'], '/user/blockings');

  if (isLoading) return <PageLoading />;

  async function unblock(id: number): Promise<void> {
    if (!window.confirm('ブロックを解除しますか？')) return;
    await run(api.delete<{ flash: { type: string; message: string } }>(`/user/blockings/${id}`), {
      invalidate: [['conversations']],
    });
    await refetch();
  }

  return (
    <div>
      <PageHeader title="ブロックリスト" back="/user/settings" />
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        ブロックすると、相手からのメッセージとオーダーへの参加が届かなくなります。
      </p>

      {data?.blockings.length ? (
        <ul>
          {data.blockings.map((blocking) => (
            <UserCardRow
              key={blocking.id}
              user={blocking.target}
              right={
                <button
                  type="button"
                  className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                  onClick={() => void unblock(blocking.id)}
                >
                  解除
                </button>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState title="ブロックしている方はいません" />
      )}
    </div>
  );
}
