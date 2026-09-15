'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ServiceMessageDto } from '@/lib';
import { l } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { EmptyState, PageHeader, PageLoading, RichText } from '@/components/ui';

/** ServiceMessagesController#load_more / #mark_read. */
export function ServiceMessagesPage(): ReactNode {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ServiceMessageDto[]>([]);
  const { data, isLoading } = useApiQuery<{
    items: ServiceMessageDto[];
    page: number;
    perPage: number;
    hasMore: boolean;
  }>(['service_messages', page], `/service_messages?page=${page}`);

  useEffect(() => {
    if (!data) return;
    setItems((current) => (page === 1 ? data.items : [...current, ...data.items]));
  }, [data, page]);

  useEffect(() => {
    // clears the unread badge, as the original did on load
    void api.post('/service_messages/mark_read').catch(() => undefined);
  }, []);

  if (isLoading && page === 1) return <PageLoading />;

  return (
    <div>
      <PageHeader title="運営局からのお知らせ" back="/user/settings" />

      {items.length ? (
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {items.map((message) => (
            <li key={message.id} className="px-4 py-4">
              <div className="flex items-center gap-2">
                {message.unread ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> : null}
                <p className="text-sm font-semibold">{message.title ?? 'お知らせ'}</p>
                <span className="ml-auto text-[10px] text-ink-500">{l(message.createdAt)}</span>
              </div>
              {message.content ? (
                <RichText html={message.content} className="mt-1.5 text-xs leading-relaxed text-ink-700" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="お知らせはありません" />
      )}

      {data?.hasMore ? (
        <div className="px-4 py-5">
          <button type="button" className="btn-secondary w-full" onClick={() => setPage(page + 1)}>
            さらに読み込む
          </button>
        </div>
      ) : null}
    </div>
  );
}
