'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import type { ConversationSummary, Paginated } from '@/lib';
import { formatTalkTime } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { SearchIcon } from '@/components/icons';
import { Avatar, Counter, EmptyState, PageHeader, PageLoading, Pagination } from '@/components/ui';

const FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'meetings', label: 'オーダー' },
] as const;

/** The room types that get a label beside the name; a private room needs none. */
const CATEGORY_LABELS: Partial<Record<ConversationSummary['category'], { label: string; className: string }>> = {
  admin: { label: '運営', className: 'bg-brand-50 text-brand-700' },
  system: { label: 'お知らせ', className: 'bg-ink-100 text-ink-600' },
  meeting: { label: 'オーダー', className: 'bg-sky-50 text-sky-700' },
};

/**
 * ConversationsController#index and #search, laid out as LINE's talk list: a
 * search pill and filter chips on top, then one row per room with the time
 * and a green unread count on the right.
 */
export function ConversationListPage(): ReactNode {
  const [tab, setTab] = useState<(typeof FILTERS)[number]['value']>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ConversationSummary[] | null>(null);

  const { data, isLoading } = useApiQuery<Paginated<ConversationSummary>>(
    ['conversations', tab, page],
    `/conversations?page=${page}${tab === 'meetings' ? '&meetings=1' : ''}`,
  );

  async function runSearch(value: string): Promise<void> {
    setSearch(value);
    if (!value) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const found = await api.get<{ items: ConversationSummary[]; flash?: { type: 'alert'; message: string } }>(
        `/conversations/search?partner_name=${encodeURIComponent(value)}`,
      );
      setResults(found.items);
    } finally {
      setSearching(false);
    }
  }

  const items = results ?? data?.items ?? [];

  return (
    <div>
      <PageHeader title="チャット" />

      <div className="px-4 pb-2">
        <label className="relative block">
          <span className="sr-only">相手の名前で検索</span>
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
            strokeWidth={2.2}
          />
          <input
            type="search"
            className="input rounded-full py-2 pl-9 text-sm"
            placeholder="相手の名前で検索（3文字以上）"
            value={search}
            onChange={(event) => void runSearch(event.target.value)}
          />
        </label>
      </div>

      {results === null ? (
        <div className="flex gap-2 px-4 pb-2 pt-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={tab === filter.value}
              onClick={() => {
                setTab(filter.value);
                setPage(1);
              }}
              className={clsx(
                'rounded-full px-3.5 py-1.5 text-[13px] font-bold transition',
                tab === filter.value ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading || searching ? (
        <PageLoading />
      ) : items.length ? (
        <ul className="pb-2">
          {items.map((conversation) => {
            const category = CATEGORY_LABELS[conversation.category];
            return (
              <li key={conversation.id}>
                <Link
                  href={`/conversations/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 no-underline hover:bg-ink-50 active:bg-ink-100"
                >
                  <Avatar src={conversation.partner?.profilePicUrl ?? conversation.pictureUrl} alt="" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate text-[15px] font-bold text-ink-900">
                        {conversation.partner?.nickName ?? conversation.name}
                      </p>
                      {category ? (
                        <span className={clsx('badge shrink-0 px-1.5 text-[10px]', category.className)}>
                          {category.label}
                        </span>
                      ) : null}
                      <span className="ml-auto shrink-0 pl-1 text-[11px] text-ink-500">
                        {formatTalkTime(conversation.updatedAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] text-ink-500">
                        {conversation.lastSenderName ? `${conversation.lastSenderName}: ` : ''}
                        {conversation.lastContent ?? 'メッセージはまだありません'}
                      </p>
                      <Counter count={conversation.unreadCount} tone="brand" />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="チャットルームがありません"
          hint="「探す」からキャストにいいねを送るとチャットルームが作成されます"
        />
      )}

      {results === null ? (
        <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
      ) : null}
    </div>
  );
}
