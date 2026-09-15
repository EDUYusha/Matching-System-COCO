'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { ConversationSummary, Paginated } from '@/lib';
import { formatRelative } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { Counter, EmptyState, PageHeader, PageLoading, Pagination, Tabs } from '@/components/ui';

/** ConversationsController#index and #search. */
export function ConversationListPage(): ReactNode {
  const [tab, setTab] = useState<'all' | 'meetings'>('all');
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

      <div className="px-4 py-3">
        <input
          className="input"
          placeholder="相手の名前で検索（3文字以上）"
          value={search}
          onChange={(event) => void runSearch(event.target.value)}
        />
      </div>

      {results === null ? (
        <Tabs
          tabs={[
            { value: 'all', label: 'すべて' },
            { value: 'meetings', label: 'オーダー' },
          ]}
          active={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
        />
      ) : null}

      {isLoading || searching ? (
        <PageLoading />
      ) : items.length ? (
        <ul className="divide-y divide-ink-200">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/conversations/${conversation.id}`}
                className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-ink-50"
              >
                <img
                  src={conversation.partner?.profilePicUrl ?? conversation.pictureUrl ?? '/system/noimage.png'}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full border border-ink-300 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {conversation.partner?.nickName ?? conversation.name}
                    </p>
                    {conversation.category === 'admin' ? (
                      <span className="badge bg-gold-100 text-gold-700">運営</span>
                    ) : conversation.category === 'system' ? (
                      <span className="badge bg-ink-200 text-ink-900">お知らせ</span>
                    ) : conversation.category === 'meeting' ? (
                      <span className="badge bg-purple-500/20 text-purple-300">オーダー</span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-ink-500">
                    {conversation.lastSenderName ? `${conversation.lastSenderName}: ` : ''}
                    {conversation.lastContent ?? 'メッセージはまだありません'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-ink-500">{formatRelative(conversation.updatedAt)}</span>
                  <Counter count={conversation.unreadCount} />
                </div>
              </Link>
            </li>
          ))}
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
