'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l, lLooseDate, numberToCredits, numberToYen } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface PayoutRow {
  id: number;
  userId: number;
  creditAmount: number;
  fee: number;
  netAmount: number;
  fastPayout: boolean;
  status: string;
  handlingType: string | null;
  scheduledPayoutOn: string;
  processedAt: string | null;
  createdAt: string;
  user: {
    id: number;
    nickName: string;
    realName: string | null;
    castBankAccount: Record<string, string> | null;
  };
}

/**
 * PayoutRequests#index — the application queue.
 *
 * `handling_type` marks the applications that are *not* paid by transfer (cash in
 * hand, or unusable bank details); those are excluded from the transfer CSV.
 */
export function PayoutRequestsPage(): ReactNode {
  const { run } = useAdminAction();
  const [filters, setFilters] = useState({ status: 'pending', scheduledOn: '', handlingType: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useAdminQuery<Paginated<PayoutRow>>(
    ['admin', 'payout_requests', filters, page],
    `/admin/payout_requests${query({ ...filters, page })}`,
  );

  const invalidate = [['admin', 'payout_requests']];

  async function process(row: PayoutRow): Promise<void> {
    if (!window.confirm(`${row.user.nickName} への ${numberToYen(row.netAmount)} を振込済みにしますか？`)) return;
    await run(api.post(`/admin/payout_requests/${row.id}/process`), { invalidate, success: '振込済みにしました' });
    await refetch();
  }

  async function cancel(row: PayoutRow): Promise<void> {
    const reason = window.prompt('取消理由（ポイントは返還されます）', '運営による取消');
    if (reason === null) return;
    await run(api.post(`/admin/payout_requests/${row.id}/cancel`, { reason }), { invalidate, success: '取消しました' });
    await refetch();
  }

  async function setHandling(row: PayoutRow, handlingType: string | null): Promise<void> {
    await run(api.patch(`/admin/payout_requests/${row.id}`, { handlingType }), { invalidate });
    await refetch();
  }

  async function release(row: PayoutRow): Promise<void> {
    await run(api.patch(`/admin/payout_requests/${row.id}`, { status: 'pending' }), {
      invalidate,
      success: '保留を解除しました',
    });
    await refetch();
  }

  return (
    <div>
      <PageTitle
        title="出金申請（申請制）"
        subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`}
        actions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => api.download(`/admin/payout_requests.csv${query({ scheduledOn: filters.scheduledOn })}`)}
          >
            振込CSVダウンロード
          </button>
        }
      />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="状態">
          <select
            className="input"
            value={filters.status}
            onChange={(event) => {
              setFilters({ ...filters, status: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="pending">申請済み</option>
            <option value="on_hold">保留</option>
            <option value="processed">振込済み</option>
            <option value="cancelled">取消</option>
          </select>
        </Field>
        <Field label="振込予定日">
          <input
            type="date"
            className="input"
            value={filters.scheduledOn}
            onChange={(event) => {
              setFilters({ ...filters, scheduledOn: event.target.value });
              setPage(1);
            }}
          />
        </Field>
        <Field label="取扱区分">
          <select
            className="input"
            value={filters.handlingType}
            onChange={(event) => {
              setFilters({ ...filters, handlingType: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="cash">現金受取</option>
            <option value="bank_ng">口座不備</option>
          </select>
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
              empty="申請がありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                {
                  header: 'キャスト',
                  cell: (row) => (
                    <div>
                      <Link href={`/users/${row.user.id}`}>{row.user.nickName}</Link>
                      {row.user.realName ? <p className="text-[11px] text-slate-400">{row.user.realName}</p> : null}
                    </div>
                  ),
                },
                {
                  header: '状態',
                  cell: (row) => (
                    <div className="space-y-1">
                      <Badge
                        tone={
                          row.status === 'processed'
                            ? 'ok'
                            : row.status === 'cancelled'
                              ? 'bad'
                              : row.status === 'on_hold'
                                ? 'warn'
                                : 'info'
                        }
                      >
                        {row.status}
                      </Badge>
                      {row.fastPayout ? <Badge tone="warn">すぐ出金</Badge> : null}
                      {row.handlingType ? <Badge>{row.handlingType}</Badge> : null}
                    </div>
                  ),
                },
                { header: 'ポイント', className: 'text-right', cell: (row) => numberToCredits(row.creditAmount) },
                { header: '手数料', className: 'text-right', cell: (row) => numberToYen(row.fee) },
                {
                  header: '振込額',
                  className: 'text-right',
                  cell: (row) => <span className="font-semibold">{numberToYen(row.netAmount)}</span>,
                },
                { header: '振込予定', cell: (row) => lLooseDate(row.scheduledPayoutOn) },
                {
                  header: '口座',
                  cell: (row) =>
                    row.user.castBankAccount ? (
                      <span className="text-[11px]">
                        {row.user.castBankAccount.bankName} {row.user.castBankAccount.branchName}
                        <br />
                        {row.user.castBankAccount.accountType} {row.user.castBankAccount.accountNumber}
                        <br />
                        {row.user.castBankAccount.holderName}
                      </span>
                    ) : (
                      <Badge tone="bad">未登録</Badge>
                    ),
                },
                { header: '申請日', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
                {
                  header: '操作',
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.status === 'pending' ? (
                        <>
                          <button type="button" className="btn-primary px-2 py-1" onClick={() => void process(row)}>
                            振込済み
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1"
                            onClick={() => void setHandling(row, row.handlingType === 'cash' ? null : 'cash')}
                          >
                            現金
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2 py-1"
                            onClick={() => void setHandling(row, row.handlingType === 'bank_ng' ? null : 'bank_ng')}
                          >
                            口座不備
                          </button>
                        </>
                      ) : null}
                      {row.status === 'on_hold' ? (
                        <button type="button" className="btn-primary px-2 py-1" onClick={() => void release(row)}>
                          保留解除
                        </button>
                      ) : null}
                      {row.status !== 'processed' && row.status !== 'cancelled' ? (
                        <button type="button" className="btn-danger px-2 py-1" onClick={() => void cancel(row)}>
                          取消
                        </button>
                      ) : null}
                    </div>
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
