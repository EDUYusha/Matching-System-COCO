'use client';

import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Avatar, EmptyState, PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * MeetingsController#select_friends / #wish_to_attend_with_friends.
 *
 * Entering with friends creates a team (one leader_id across the rows), which
 * AutoSelectCast then takes or drops as a unit.
 */
export function SelectFriendsPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ friends: UserCard[] }>(
    ['meeting', id, 'friends'],
    `/meetings/${id}/select_friends`,
  );

  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;

  async function submit(): Promise<void> {
    setSubmitting(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>(`/meetings/${id}/wish_to_attend`, {
        friendIds: selected,
      }),
      { invalidate: [['meetings']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="お友達と一緒にエントリー" back="/meetings" />
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        一緒に参加したいお友達を選んでください。チームは全員まとめて選ばれるか、まとめて外れます。
      </p>

      {data?.friends.length ? (
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {data.friends.map((friend) => {
            const active = selected.includes(friend.id);
            return (
              <li key={friend.id}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(active ? selected.filter((candidate) => candidate !== friend.id) : [...selected, friend.id])
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Avatar src={friend.profilePicUrl} alt={friend.nickName} />
                  <span className="min-w-0 flex-1 truncate text-sm">{friend.nickName}</span>
                  <span className={`text-xl ${active ? 'text-gold-700' : 'text-ink-600'}`}>{active ? '☑' : '☐'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="相互のお友達がいません" hint="マイページの「友達を紹介する」から追加できます" />
      )}

      <div className="space-y-2 px-4 py-5">
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || selected.length === 0}
          onClick={() => void submit()}
        >
          {submitting ? <Spinner /> : null}
          {selected.length}名と一緒にエントリー
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          disabled={submitting}
          onClick={() => {
            setSelected([]);
            void submit();
          }}
        >
          ひとりでエントリー
        </button>
      </div>
    </div>
  );
}
