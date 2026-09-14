'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l } from '@/lib';
import { query } from '@/client/admin-api';
import { useAdminQuery } from '@/client/admin-hooks';
import { DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface ReviewRow {
  id: number;
  stars: number | null;
  comment: string | null;
  createdAt: string;
  reviewer: { id: number; nickName: string; userType: string } | null;
  reviewee: { id: number; nickName: string; userType: string } | null;
  meeting: { id: number; plannedStartTime: string } | null;
}

/** Reviews#index — the operator's review inbox, used to follow up on low scores. */
export function ReviewsPage(): ReactNode {
  const [filters, setFilters] = useState({ revieweeId: '', stars: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminQuery<Paginated<ReviewRow>>(
    ['admin', 'reviews', filters, page],
    `/admin/reviews${query({ ...filters, page })}`,
  );

  return (
    <div>
      <PageTitle title="レビュー" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="評価">
          <select
            className="input"
            value={filters.stars}
            onChange={(event) => {
              setFilters({ ...filters, stars: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            {[1, 2, 3, 4, 5].map((star) => (
              <option key={star} value={star}>
                星{star}
              </option>
            ))}
          </select>
        </Field>
        <Field label="対象ユーザーID">
          <input
            className="input"
            value={filters.revieweeId}
            onChange={(event) => {
              setFilters({ ...filters, revieweeId: event.target.value });
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
              empty="レビューがありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                {
                  header: '評価',
                  cell: (row) => (
                    <span className={(row.stars ?? 0) <= 2 ? 'font-bold text-rose-600' : 'text-amber-500'}>
                      {'★'.repeat(row.stars ?? 0)}
                    </span>
                  ),
                },
                {
                  header: 'レビュアー',
                  cell: (row) => (row.reviewer ? <Link href={`/users/${row.reviewer.id}`}>{row.reviewer.nickName}</Link> : '—'),
                },
                {
                  header: '対象',
                  cell: (row) => (row.reviewee ? <Link href={`/users/${row.reviewee.id}`}>{row.reviewee.nickName}</Link> : '—'),
                },
                {
                  header: 'オーダー',
                  cell: (row) => (row.meeting ? <Link href={`/meetings/${row.meeting.id}`}>{row.meeting.id}</Link> : '—'),
                },
                {
                  header: 'コメント',
                  cell: (row) => <span className="max-w-xl whitespace-pre-wrap text-[12px]">{row.comment ?? ''}</span>,
                },
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
