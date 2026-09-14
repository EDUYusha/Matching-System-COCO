'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from '@/client/navigation';
import { useState, type ReactNode } from 'react';
import type { MeetingPreferenceDto, MeetingSummary, Paginated } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { useCounters, useCurrentUser } from '@/client/store';
import { EmptyState, PageHeader, PageLoading, Pagination, Tabs } from '@/components/ui';
import { MeetingCard } from '@/components/MeetingCard';

interface MeetingListResponse extends Paginated<MeetingSummary> {
  requestCount: number;
  meetingPreferences: MeetingPreferenceDto[];
}

type Tab = 'available' | 'later' | 'planned' | 'requested';

/**
 * MeetingsController#index — the cast's order board.
 *
 * Four lists: orders recruiting now, orders recruiting for later, the cast's own
 * confirmed orders, and individual requests waiting on their answer.
 */
export function MeetingListPage(): ReactNode {
  const user = useCurrentUser();
  const counters = useCounters();
  const router = useRouter();
  const { run } = useAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const tab = (searchParams.get('tab') as Tab | null) ?? 'available';

  const { data, isLoading, refetch } = useApiQuery<MeetingListResponse>(
    ['meetings', tab, page],
    `/meetings?tab=${tab}&page=${page}`,
  );

  // a guest has no order board; they order from home
  if (user && !user.permissions.cast) {
    return (
      <div>
        <PageHeader title="オーダー" />
        <EmptyState title="オーダーの募集一覧はキャスト専用です" hint="ホームからキャストを呼べます" />
        <div className="px-4">
          <Link href="/home" className="btn-primary w-full no-underline">
            ホームへ
          </Link>
        </div>
      </div>
    );
  }

  async function toggleAvailability(): Promise<void> {
    await run(api.post(counters.availability && user?.available ? '/user/unavailable' : '/user/available'), {
      invalidate: [['me'], ['meetings']],
    });
    await refetch();
  }

  async function enter(meeting: MeetingSummary): Promise<void> {
    await run(api.post(`/meetings/${meeting.id}/wish_to_attend`), { invalidate: [['meetings']] });
    await refetch();
  }

  async function leave(meeting: MeetingSummary): Promise<void> {
    if (!window.confirm('このオーダーから出ますか？')) return;
    await run(api.post(`/meetings/${meeting.id}/wish_to_not_attend`), { invalidate: [['meetings']] });
    await refetch();
  }

  return (
    <div>
      <PageHeader
        title="呼ばれる"
        subtitle={user?.available ? '待機中' : '待機していません'}
        action={
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => void toggleAvailability()}>
            {user?.available ? '待機をやめる' : '待機する'}
          </button>
        }
      />

      <Tabs<Tab>
        tabs={[
          { value: 'available', label: '募集中' },
          { value: 'later', label: '以降の予定' },
          { value: 'planned', label: '確定済み' },
          { value: 'requested', label: '個TOLA依頼', count: data?.requestCount ?? 0 },
        ]}
        active={tab}
        onChange={(value) => {
          setPage(1);
          setSearchParams({ tab: value });
        }}
      />

      {isLoading ? (
        <PageLoading />
      ) : data?.items.length ? (
        <ul>
          {data.items.map((meeting) => {
            const mine = meeting.myAttendance;
            const isEntered = !!mine && mine.role !== 'out';
            const canEnter = ['requested', 'cast_selectable'].includes(meeting.status) && !isEntered;
            const canLeave = isEntered && ['requested', 'cast_selectable'].includes(meeting.status);

            return (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                action={
                  tab === 'requested' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        onClick={() =>
                          void run(api.post(`/meetings/${meeting.id}/accept`), { invalidate: [['meetings']] })
                        }
                      >
                        承認する
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex-1"
                        onClick={() =>
                          void run(api.post(`/meetings/${meeting.id}/refuse`), { invalidate: [['meetings']] })
                        }
                      >
                        辞退する
                      </button>
                    </div>
                  ) : canEnter ? (
                    <div className="flex gap-2">
                      <button type="button" className="btn-primary flex-1" onClick={() => void enter(meeting)}>
                        エントリーする
                      </button>
                      <button
                        type="button"
                        className="btn-secondary shrink-0 px-3"
                        onClick={() => router.push(`/meetings/${meeting.id}/select_friends`)}
                        title="お友達と一緒にエントリー"
                      >
                        👭
                      </button>
                    </div>
                  ) : canLeave ? (
                    <button type="button" className="btn-secondary w-full" onClick={() => void leave(meeting)}>
                      エントリーを取り消す
                    </button>
                  ) : meeting.conversationId ? (
                    <Link href={`/conversations/${meeting.conversationId}`} className="btn-secondary w-full no-underline">
                      チャットを開く
                    </Link>
                  ) : null
                }
              />
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={
            tab === 'requested'
              ? '個TOLAの依頼はありません'
              : tab === 'planned'
                ? '確定済みのオーダーはありません'
                : '現在募集中のオーダーはありません'
          }
          hint={tab === 'available' ? '待機状態にすると新しいオーダーの通知を受け取れます' : undefined}
        />
      )}

      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
