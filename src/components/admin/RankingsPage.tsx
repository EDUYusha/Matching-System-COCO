'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { numberToCredits } from '@/lib';
import { query } from '@/client/admin-api';
import { useAdminQuery } from '@/client/admin-hooks';
import { DataTable, Field, Loading, PageTitle } from '@/components/admin/ui';

interface RankingRow {
  position: number;
  score: number;
  userId: number;
  nickName: string;
  userType: string;
  guestTitle: string | null;
}

/** Users#ranking / #rankingCustomer — operators see everyone, unmasked. */
export function RankingsPage(): ReactNode {
  const [filters, setFilters] = useState({ category: 'credits', period: 'this_month', userType: 'cast' });

  const { data, isLoading } = useAdminQuery<{ rows: RankingRow[] }>(
    ['admin', 'rankings', filters],
    `/admin/rankings${query(filters)}`,
  );

  return (
    <div>
      <PageTitle title="ランキング" subtitle="非公開設定のメンバーも含めて表示します" />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="種別">
          <select
            className="input"
            value={filters.category}
            onChange={(event) => setFilters({ ...filters, category: event.target.value })}
          >
            <option value="credits">総合</option>
            <option value="meeting">オーダー</option>
            <option value="sticker">スタンプ・特典</option>
            <option value="patron">師匠</option>
          </select>
        </Field>
        <Field label="期間">
          <select
            className="input"
            value={filters.period}
            onChange={(event) => setFilters({ ...filters, period: event.target.value })}
          >
            <option value="yesterday">昨日</option>
            <option value="this_week">今週</option>
            <option value="this_month">今月</option>
            <option value="prev_month">先月</option>
            <option value="this_year">今年</option>
          </select>
        </Field>
        <Field label="対象">
          <select
            className="input"
            value={filters.userType}
            onChange={(event) => setFilters({ ...filters, userType: event.target.value })}
          >
            <option value="cast">キャスト</option>
            <option value="customer">ゲスト</option>
          </select>
        </Field>
      </div>

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <DataTable
            rows={data?.rows ?? []}
            rowKey={(row) => `${row.userId}-${row.position}`}
            empty="対象がありません"
            columns={[
              { header: '順位', className: 'text-right', cell: (row) => row.position },
              { header: 'ユーザー', cell: (row) => <Link href={`/users/${row.userId}`}>{row.nickName}</Link> },
              { header: '種別', cell: (row) => row.userType },
              { header: '称号', cell: (row) => row.guestTitle ?? '—' },
              {
                header: 'スコア',
                className: 'text-right',
                cell: (row) => <span className="font-semibold">{numberToCredits(row.score)}</span>,
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
