'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { MeetingSummary, Paginated } from '@/lib';
import { ADMIN_MEETING_STATUS_LABELS, l, MEETING_STATUSES, numberToCredits } from '@/lib';
import { query } from '@/client/admin-api';
import { useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface AdminMeetingRow extends MeetingSummary {
  cast: Array<{
    id: number;
    userId: number;
    nickName: string;
    role: string;
    decisionBy: string | null;
    startTime: string | null;
    endTime: string | null;
  }>;
}

/** Meetings#index. */
export function MeetingsPage(): ReactNode {
  const [filters, setFilters] = useState({ status: '', category: '', from: '', to: '', ownerId: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAdminQuery<Paginated<AdminMeetingRow>>(
    ['admin', 'meetings', filters, page],
    `/admin/meetings${query({ ...filters, page })}`,
  );

  return (
    <div>
      <PageTitle title="オーダー管理" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-5">
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
            {MEETING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field label="区分">
          <select
            className="input"
            value={filters.category}
            onChange={(event) => {
              setFilters({ ...filters, category: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="general">グループ</option>
            <option value="individual">個TOLA</option>
          </select>
        </Field>
        <Field label="開始日（以降）">
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
        <Field label="開始日（以前）">
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
        <Field label="ゲストID">
          <input
            className="input"
            value={filters.ownerId}
            onChange={(event) => {
              setFilters({ ...filters, ownerId: event.target.value });
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
              empty="オーダーがありません"
              columns={[
                { header: 'ID', cell: (row) => <Link href={`/meetings/${row.id}`}>{row.id}</Link> },
                {
                  header: '状態',
                  cell: (row) => (
                    <Badge
                      tone={
                        row.status === 'completed'
                          ? 'ok'
                          : row.status.endsWith('_fail')
                            ? 'bad'
                            : row.status === 'in_progress'
                              ? 'info'
                              : 'warn'
                      }
                    >
                      {ADMIN_MEETING_STATUS_LABELS[row.status]}
                    </Badge>
                  ),
                },
                { header: '区分', cell: (row) => (row.category === 'individual' ? '個TOLA' : 'グループ') },
                {
                  header: 'ゲスト',
                  cell: (row) =>
                    row.owner ? <Link href={`/users/${row.owner.id}`}>{row.owner.nickName}</Link> : `ID ${row.ownerId}`,
                },
                { header: 'エリア', cell: (row) => row.areaName },
                { header: '開始', cell: (row) => <span className="text-[11px]">{l(row.plannedStartTime)}</span> },
                {
                  header: '人数',
                  cell: (row) => `${row.attendingCount}/${row.neededPersonCount}（応募 ${row.attendanceCount}）`,
                },
                {
                  header: 'キャスト',
                  cell: (row) => (
                    <div className="text-[11px]">
                      {row.cast
                        .filter((attendance) => attendance.role !== 'out')
                        .map((attendance) => (
                          <p key={attendance.id}>
                            <Link href={`/users/${attendance.userId}`}>{attendance.nickName}</Link>
                            <span className="ml-1 text-slate-400">{attendance.role}</span>
                          </p>
                        ))}
                    </div>
                  ),
                },
                {
                  header: '金額',
                  className: 'text-right',
                  cell: (row) => (
                    <div className="text-right">
                      <p>{row.finalCosts === null ? '—' : numberToCredits(row.finalCosts)}</p>
                      <p className="text-[11px] text-slate-400">
                        概算 {numberToCredits(row.estimatedCostsWithNightSurcharge)}
                      </p>
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
