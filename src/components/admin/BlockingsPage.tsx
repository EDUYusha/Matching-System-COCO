'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { DataTable, Field, Loading, PageTitle, Pagination, Spinner } from '@/components/admin/ui';

interface BlockingRow {
  id: number;
  createdAt: string;
  user: { id: number; nickName: string };
  target: { id: number; nickName: string };
}

/**
 * Blockings — the operator can add or remove a block on a member's behalf.
 * Creating one also mutes the shared room and ignores its unread rows.
 */
export function BlockingsPage(): ReactNode {
  const { run } = useAdminAction();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ userId: '', targetId: '' });
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useAdminQuery<Paginated<BlockingRow>>(
    ['admin', 'blockings', page],
    `/admin/blockings${query({ page })}`,
  );

  async function create(): Promise<void> {
    setSaving(true);
    await run(api.post('/admin/blockings', { userId: Number(form.userId), targetId: Number(form.targetId) }), {
      invalidate: [['admin', 'blockings']],
      success: 'ブロックを追加しました',
    });
    setSaving(false);
    setForm({ userId: '', targetId: '' });
    await refetch();
  }

  async function destroy(row: BlockingRow): Promise<void> {
    if (!window.confirm('このブロックを解除しますか？')) return;
    await run(api.delete(`/admin/blockings/${row.id}`), {
      invalidate: [['admin', 'blockings']],
      success: '解除しました',
    });
    await refetch();
  }

  return (
    <div>
      <PageTitle title="ブロック" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="ブロックする人のID">
          <input className="input" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} />
        </Field>
        <Field label="ブロックされる人のID">
          <input
            className="input"
            value={form.targetId}
            onChange={(event) => setForm({ ...form, targetId: event.target.value })}
          />
        </Field>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void create()}
          disabled={saving || !form.userId || !form.targetId}
        >
          {saving ? <Spinner /> : null}
          追加する
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(row) => row.id}
              empty="ブロックはありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                { header: 'ブロックした人', cell: (row) => <Link href={`/users/${row.user.id}`}>{row.user.nickName}</Link> },
                { header: 'ブロックされた人', cell: (row) => <Link href={`/users/${row.target.id}`}>{row.target.nickName}</Link> },
                { header: '日時', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
                {
                  header: '',
                  cell: (row) => (
                    <button type="button" className="btn-secondary px-2 py-1" onClick={() => void destroy(row)}>
                      解除
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
