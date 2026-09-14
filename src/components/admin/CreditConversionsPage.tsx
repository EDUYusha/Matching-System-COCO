'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l, numberToCredits, numberToYen } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface ConversionRow {
  id: number;
  userId: number;
  amount: number;
  credits: number | null;
  currency: string;
  flowDirection: string;
  checked: boolean;
  code: string | null;
  createdAt: string;
  inverseConversionId: number | null;
  user: { id: number; nickName: string; userType: string; castBankAccount: Record<string, string> | null };
  creditTransaction: { id: number; category: string; reason: string | null } | null;
}

/**
 * CreditConversions#apply_out_cash — where real money entered or left.
 *
 * `checked` is the operator's reconciliation flag against the payment provider or
 * the bank, which is why it is editable here and nowhere else.
 */
export function CreditConversionsPage(): ReactNode {
  const { run } = useAdminAction();
  const [filters, setFilters] = useState({ flowDirection: 'out', checked: '', userId: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useAdminQuery<Paginated<ConversionRow>>(
    ['admin', 'credit_conversions', filters, page],
    `/admin/credit_conversions${query({ ...filters, page })}`,
  );

  async function toggleChecked(row: ConversionRow): Promise<void> {
    await run(api.patch(`/admin/credit_conversions/${row.id}`, { checked: !row.checked }), {
      invalidate: [['admin', 'credit_conversions']],
    });
    await refetch();
  }

  return (
    <div>
      <PageTitle title="出金申請管理（入出金）" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="区分">
          <select
            className="input"
            value={filters.flowDirection}
            onChange={(event) => {
              setFilters({ ...filters, flowDirection: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="in">入金（チャージ）</option>
            <option value="re_in">再入金</option>
            <option value="out">出金</option>
            <option value="fast_out">すぐ出金</option>
          </select>
        </Field>
        <Field label="確認状況">
          <select
            className="input"
            value={filters.checked}
            onChange={(event) => {
              setFilters({ ...filters, checked: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="0">未確認</option>
            <option value="1">確認済み</option>
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
      </div>

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(row) => row.id}
              empty="対象がありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                { header: 'ユーザー', cell: (row) => <Link href={`/users/${row.user.id}`}>{row.user.nickName}</Link> },
                {
                  header: '区分',
                  cell: (row) => (
                    <Badge tone={row.flowDirection.endsWith('out') ? 'warn' : 'ok'}>{row.flowDirection}</Badge>
                  ),
                },
                {
                  header: '金額',
                  className: 'text-right',
                  cell: (row) => <span className="font-semibold">{numberToYen(row.amount)}</span>,
                },
                {
                  header: 'ポイント',
                  className: 'text-right',
                  cell: (row) => (row.credits === null ? '—' : numberToCredits(row.credits)),
                },
                { header: '取引', cell: (row) => <span className="text-[11px]">{row.creditTransaction?.category ?? '—'}</span> },
                { header: 'オーダーNo', cell: (row) => <span className="text-[11px]">{row.code ?? '—'}</span> },
                {
                  header: '逆仕訳',
                  cell: (row) => (row.inverseConversionId ? `#${row.inverseConversionId}` : '—'),
                },
                {
                  header: '口座',
                  cell: (row) =>
                    row.user.castBankAccount ? (
                      <span className="text-[11px]">
                        {row.user.castBankAccount.bankName} {row.user.castBankAccount.accountNumber}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { header: '日時', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
                {
                  header: '確認',
                  cell: (row) => (
                    <button
                      type="button"
                      className={row.checked ? 'btn-secondary px-2 py-1' : 'btn-primary px-2 py-1'}
                      onClick={() => void toggleChecked(row)}
                    >
                      {row.checked ? '確認済み' : '未確認'}
                    </button>
                  ),
                },
              ]}
            />
            <Pagination page={page} totalPages={data?.totalPages ?? 1} totalCount={data?.totalCount} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
