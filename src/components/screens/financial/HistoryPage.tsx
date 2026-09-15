'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { TransactionRow } from '@/lib';
import { l, numberToCredits, numberToTransferredCredits } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { EmptyState, PageHeader, PageLoading } from '@/components/ui';

interface HistoryResponse {
  transactions: TransactionRow[];
  hasMore: boolean;
  page: number;
  creditBalance: number;
}

/** FinancialController#history — the points ledger. */
export function HistoryPage(): ReactNode {
  const user = useCurrentUser();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApiQuery<HistoryResponse>(
    ['financial', 'history', page],
    `/financial/history?page=${page}`,
  );

  if (isLoading) return <PageLoading />;

  const isGuest = !!user?.permissions.customer && !user.permissions.cast;

  return (
    <div>
      <PageHeader
        title={isGuest ? 'ポイント履歴・領収書' : '売上履歴一覧'}
        back="/user/settings"
        subtitle={`残高 ${numberToCredits(data?.creditBalance ?? 0)}`}
      />

      {data?.transactions.length ? (
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {data.transactions.map((row, index) => (
            <li key={`${row.createdAt}-${index}`} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{row.categoryLabel}</p>
                  <p className="text-[11px] text-ink-500">{l(row.createdAt)}</p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold ${row.total >= 0 ? 'text-emerald-600' : 'text-ink-900'}`}
                >
                  {numberToTransferredCredits(row.total)}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                {row.meetingId ? (
                  <Link href={`/financial/history_details?meeting_id=${row.meetingId}`}>合流ポイントの詳細</Link>
                ) : null}
                {row.stickerId ? <Link href={`/financial/stickers/${row.stickerId}`}>ギフトの詳細</Link> : null}
                {row.creditConversionId && row.total < 0 === false && row.category === 'charge' ? (
                  <button
                    type="button"
                    className="text-gold-700"
                    onClick={() => api.download(`/financial/receipts/${row.creditConversionId}`)}
                  >
                    領収書をダウンロード
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="履歴はまだありません" />
      )}

      <div className="flex items-center justify-center gap-2 py-5">
        <button type="button" className="btn-secondary px-3 py-1.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          &lt;
        </button>
        <span className="text-xs text-ink-500">{page}</span>
        <button
          type="button"
          className="btn-secondary px-3 py-1.5"
          disabled={!data?.hasMore}
          onClick={() => setPage(page + 1)}
        >
          &gt;
        </button>
      </div>
    </div>
  );
}
