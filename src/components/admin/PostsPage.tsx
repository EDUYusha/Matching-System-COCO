'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface PostRow {
  id: number;
  content: string;
  category: string;
  postLikesCount: number;
  createdAt: string;
  user: { id: number; nickName: string; userType: string };
  postPictures: Array<{ id: number; fileData: unknown }>;
  _count: { postLikes: number };
}

/** Posts#index — timeline moderation. */
export function PostsPage(): ReactNode {
  const { run } = useAdminAction();
  const [filters, setFilters] = useState({ category: '', userId: '' });
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useAdminQuery<Paginated<PostRow>>(
    ['admin', 'posts', filters, page],
    `/admin/posts${query({ ...filters, page })}`,
  );

  async function destroy(row: PostRow): Promise<void> {
    if (!window.confirm('このつぶやきを削除しますか？')) return;
    await run(api.delete(`/admin/posts/${row.id}`), { invalidate: [['admin', 'posts']], success: '削除しました' });
    await refetch();
  }

  return (
    <div>
      <PageTitle title="つぶやき" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="公開範囲">
          <select
            className="input"
            value={filters.category}
            onChange={(event) => {
              setFilters({ ...filters, category: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="public">全体</option>
            <option value="cast_only">キャストのみ</option>
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
              empty="つぶやきがありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                { header: '投稿者', cell: (row) => <Link href={`/users/${row.user.id}`}>{row.user.nickName}</Link> },
                { header: '公開範囲', cell: (row) => <Badge>{row.category}</Badge> },
                {
                  header: '本文',
                  cell: (row) => (
                    <div
                      className="max-w-xl whitespace-pre-wrap break-words text-[12px]"
                      dangerouslySetInnerHTML={{ __html: row.content }}
                    />
                  ),
                },
                { header: '画像', cell: (row) => row.postPictures.length },
                { header: 'いいね', className: 'text-right', cell: (row) => row._count.postLikes },
                { header: '投稿日', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
                {
                  header: '',
                  cell: (row) => (
                    <button type="button" className="btn-danger px-2 py-1" onClick={() => void destroy(row)}>
                      削除
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
