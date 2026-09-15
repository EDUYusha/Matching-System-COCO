'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { CREDIT_CATEGORY_LABELS, CREDIT_TRANSACTION_CATEGORIES, l, numberToCredits } from '@/lib';
import { query } from '@/client/admin-api';
import { useAdminQuery } from '@/client/admin-hooks';
import { DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface TransactionRow {
  id: number;
  category: string;
  chargedUserId: number | null;
  creditedUserId: number | null;
  chargedAmount: number | null;
  creditedAmount: number | null;
  reason: string | null;
  createdAt: string;
  chargedUser: { id: number; nickName: string } | null;
  creditedUser: { id: number; nickName: string } | null;
}

interface Response extends Paginated<TransactionRow> {
  totals: { chargedAmount: number; creditedAmount: number };
}

/** CreditTransactions#index — the full ledger. */
export function CreditTransactionsPage(): ReactNode {
  const [filters, setFilters] = useState({ category: '', userId: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminQuery<Response>(
    ['admin', 'credit_transactions', filters, page],
    `/admin/credit_transactions${query({ ...filters, page })}`,
  );

  return (
    <div>
      <PageTitle
        title="ポイント取引"
        subtitle={
          data
            ? `${data.totalCount.toLocaleString()} 件 ／ 請求 ${numberToCredits(data.totals.chargedAmount)} ／ 付与 ${numberToCredits(data.totals.creditedAmount)}`
            : undefined
        }
      />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-4">
        <Field label="種別">
          <select
            className="input"
            value={filters.category}
            onChange={(event) => {
              setFilters({ ...filters, category: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            {CREDIT_TRANSACTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CREDIT_CATEGORY_LABELS[category] ?? category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ユーザーID">
          <input
            className="input"
            value={filters.userId}
            onChange={(event) => {
              setFilters({ ...filters, userId: event.target.value });
              setPage(1);
            }}
          />
        </Field>
        <Field label="日付（以降）">
          <input
            type="date"
            className="input"
            value={filters.from}
            onChange={(event) => {
              setFilters({ ...filters, from: event.target.value });
              setPage(1);
            }}
          />
        </Field>
        <Field label="日付（以前）">
          <input
            type="date"
            className="input"
            value={filters.to}
            onChange={(event) => {
              setFilters({ ...filters, to: event.target.value });
              setPage(1);
            }}
          />
        </Field>
      </div>

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(row) => row.id}
              empty="取引がありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                { header: '種別', cell: (row) => CREDIT_CATEGORY_LABELS[row.category] ?? row.category },
                {
                  header: '支払（from）',
                  cell: (row) =>
                    row.chargedUser ? <Link href={`/users/${row.chargedUser.id}`}>{row.chargedUser.nickName}</Link> : '—',
                },
                {
                  header: '請求額',
                  className: 'text-right',
                  cell: (row) => (row.chargedAmount === null ? '—' : numberToCredits(row.chargedAmount)),
                },
                {
                  header: '受取（to）',
                  cell: (row) =>
                    row.creditedUser ? <Link href={`/users/${row.creditedUser.id}`}>{row.creditedUser.nickName}</Link> : '—',
                },
                {
                  header: '付与額',
                  className: 'text-right',
                  cell: (row) => (row.creditedAmount === null ? '—' : numberToCredits(row.creditedAmount)),
                },
                { header: '理由', cell: (row) => <span className="text-[11px]">{row.reason ?? ''}</span> },
                { header: '日時', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
              ]}
            />
            <Pagination page={page} totalPages={data?.totalPages ?? 1} totalCount={data?.totalCount} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
