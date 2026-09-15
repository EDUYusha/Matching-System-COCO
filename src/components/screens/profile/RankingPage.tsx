'use client';

import Link from 'next/link';
import { useSearchParams } from '@/client/navigation';
import type { ReactNode } from 'react';
import type { RankingResponse } from '@/lib';
import { l, numberToCredits } from '@/client/format';
import { useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { Avatar, EmptyState, LevelBadge, PageHeader, PageLoading, Tabs } from '@/components/ui';

/**
 * ProfilesController#ranking.
 *
 * The tab set differs by audience, which the API enforces: a guest's
 * "期間限定" is event_choco_count, a cast's is limited_event, and asking for the
 * wrong one is redirected rather than erroring.
 */
export function RankingPage(): ReactNode {
  const user = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading } = useApiQuery<RankingResponse>(
    ['ranking', searchParams.toString()],
    `/profiles/ranking?${searchParams.toString()}`,
  );

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next);
  }

  const userType = data?.userType ?? user?.userType ?? 'cast';
  const category = data?.category ?? 'credits';

  const categories =
    userType === 'cast'
      ? ([
          { value: 'credits', label: '総合' },
          { value: 'meeting', label: 'オーダー' },
          { value: 'sticker', label: 'スタンプ&特典P' },
          { value: 'limited_event', label: '期間限定' },
        ] as const)
      : ([
          { value: 'credits', label: '総合' },
          { value: 'meeting', label: 'オーダー' },
          { value: 'sticker', label: 'スタンプ&特典P' },
          { value: 'patron', label: '師匠' },
          { value: 'event_choco_count', label: '期間限定' },
        ] as const);

  const periods =
    category === 'limited_event' || category === 'event_choco_count'
      ? ([
          { value: 'event_period', label: 'イベント期間' },
          { value: 'this_month', label: '今月' },
          { value: 'prev_month', label: '先月' },
        ] as const)
      : ([
          { value: 'yesterday', label: '昨日' },
          { value: 'this_week', label: '今週' },
          { value: 'this_month', label: '今月' },
          { value: 'prev_month', label: '先月' },
          { value: 'this_year', label: '今年' },
        ] as const);

  return (
    <div>
      <PageHeader title="ランキング" back="/profiles/search" />

      <Tabs
        tabs={[
          { value: 'cast', label: 'キャスト' },
          { value: 'customer', label: 'ゲスト' },
        ]}
        active={userType === 'cast' ? 'cast' : 'customer'}
        onChange={(value) => setParam('user_type', value)}
      />

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 py-2">
        {categories.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setParam('category', entry.value)}
            className={`badge shrink-0 px-2.5 py-1 ${
              category === entry.value ? 'bg-gold-500 text-ink-900' : 'border border-ink-300 bg-white text-ink-700'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-ink-200 px-3 pb-2">
        {periods.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setParam('period', entry.value)}
            className={`badge shrink-0 px-2.5 py-1 ${
              data?.period === entry.value ? 'bg-ink-100 text-ink-900' : 'border border-ink-200 text-ink-500'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {data?.campaign ? (
        <p className="px-4 py-2 text-[11px] text-gold-700">
          {data.campaign.name}（{l(data.campaign.startAt)} 〜 {l(data.campaign.endAt)}）
        </p>
      ) : null}

      {isLoading ? (
        <PageLoading />
      ) : data?.rows.length ? (
        <>
          <ol className="divide-y divide-ink-200">
            {data.rows.map((row) => (
              <li key={`${row.userId}-${row.position}`} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`w-7 shrink-0 text-center text-sm font-bold ${
                    row.position === 1
                      ? 'text-yellow-300'
                      : row.position === 2
                        ? 'text-slate-300'
                        : row.position === 3
                          ? 'text-amber-600'
                          : 'text-ink-500'
                  }`}
                >
                  {row.position}
                </span>
                {row.linkable ? (
                  <Link href={`/profiles/${row.userId}`} className="shrink-0 no-underline">
                    <Avatar src={row.profilePicUrl} alt={row.nickName} />
                  </Link>
                ) : (
                  <Avatar src={row.profilePicUrl} alt={row.nickName} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.nickName}
                    {row.guestTitle ? <span className="ml-1 text-[10px] text-gold-700">{row.guestTitle}</span> : null}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                    <LevelBadge level={row.level} />
                    {row.birthdayPublished && row.age !== null ? <span>{row.age}歳</span> : null}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold text-gold-700">
                  {/* the gift-count ranking is a count, not an amount */}
                  {data.category === 'event_choco_count' ? `${row.score}個` : numberToCredits(row.score)}
                </span>
              </li>
            ))}
          </ol>

          {data.myRanking && !data.myRankingInTopThirty ? (
            <div className="sticky bottom-[68px] border-t border-gold-300 bg-white/95 px-4 py-3">
              <p className="mb-1 text-[10px] text-ink-500">あなたの順位</p>
              <div className="flex items-center gap-3">
                <span className="w-7 text-center text-sm font-bold text-gold-700">{data.myRanking.position}</span>
                <Avatar src={data.myRanking.profilePicUrl} alt={data.myRanking.nickName} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm">{data.myRanking.nickName}</p>
                <span className="text-sm font-bold text-gold-700">
                  {data.category === 'event_choco_count'
                    ? `${data.myRanking.score}個`
                    : numberToCredits(data.myRanking.score)}
                </span>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          title={
            data?.category === 'limited_event' && !data.campaign
              ? '現在集計中です。'
              : 'この期間のランキングはまだありません'
          }
        />
      )}
    </div>
  );
}
