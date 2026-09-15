'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { l } from '@/lib';
import { api } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Loading, PageTitle } from '@/components/admin/ui';

interface AccessRequestRow {
  id: number;
  interview: boolean;
  uploadedPicture: string | null;
  createdAt: string;
  user: {
    id: number;
    nickName: string;
    accessLevel: string;
    phone: string | null;
    age: number | null;
    businessAreaName: string | null;
    castLevelName: string | null;
  } | null;
}

/**
 * The cast onboarding queue. Advancing the access level is what unlocks the cast's
 * account, so the ladder is exposed directly as buttons.
 */
const NEXT_LEVELS: Array<{ level: string; label: string }> = [
  { level: 'interview_date_pending', label: '面接日調整へ' },
  { level: 'interview_pending', label: '面接待ちへ' },
  { level: 'contract_pending', label: '同意書待ちへ' },
  { level: 'contract_accepted', label: '同意書受領へ' },
  { level: 'full', label: '本登録にする' },
  { level: 'rejected', label: '却下する' },
];

export function AccessRequestsPage(): ReactNode {
  const { run } = useAdminAction();
  const { data, isLoading, refetch } = useAdminQuery<{ items: AccessRequestRow[] }>(
    ['admin', 'access_requests'],
    '/admin/access_requests',
  );

  if (isLoading) return <Loading />;

  async function setLevel(userId: number, accessLevel: string, label: string): Promise<void> {
    if (!window.confirm(`このキャストを「${label}」に変更しますか？`)) return;
    await run(api.patch(`/admin/users/${userId}`, { accessLevel }), {
      invalidate: [['admin', 'access_requests']],
      success: '登録状況を更新しました',
    });
    await refetch();
  }

  return (
    <div>
      <PageTitle title="本登録審査" subtitle={`${data?.items.length ?? 0} 件`} />

      <div className="card">
        <DataTable
          rows={data?.items ?? []}
          rowKey={(row) => row.id}
          empty="審査対象がありません"
          columns={[
            {
              header: 'キャスト',
              cell: (row) =>
                row.user ? (
                  <div>
                    <Link href={`/users/${row.user.id}`}>{row.user.nickName}</Link>
                    <p className="text-[11px] text-slate-400">
                      ID {row.user.id}
                      {row.user.age !== null ? ` ・ ${row.user.age}歳` : ''}
                      {row.user.phone ? ` ・ ${row.user.phone}` : ''}
                    </p>
                  </div>
                ) : (
                  '—'
                ),
            },
            { header: '支店', cell: (row) => row.user?.businessAreaName ?? '—' },
            { header: 'レベル', cell: (row) => row.user?.castLevelName ?? '—' },
            {
              header: '登録状況',
              cell: (row) => (
                <Badge tone={row.user?.accessLevel === 'full' ? 'ok' : 'warn'}>{row.user?.accessLevel}</Badge>
              ),
            },
            {
              header: '身分証',
              cell: (row) =>
                row.uploadedPicture && row.user ? (
                  <a href={`/api/admin/access_requests/${row.user.id}/picture`} target="_blank" rel="noopener noreferrer">
                    画像を見る
                  </a>
                ) : (
                  <Badge tone="bad">未提出</Badge>
                ),
            },
            { header: '面接希望', cell: (row) => (row.interview ? <Badge tone="info">あり</Badge> : 'なし') },
            { header: '申請日', cell: (row) => <span className="text-[11px]">{l(row.createdAt)}</span> },
            {
              header: '操作',
              cell: (row) =>
                row.user ? (
                  <div className="flex flex-wrap gap-1">
                    {NEXT_LEVELS.map((next) => (
                      <button
                        key={next.level}
                        type="button"
                        className={next.level === 'rejected' ? 'btn-danger px-2 py-1' : 'btn-secondary px-2 py-1'}
                        onClick={() => void setLevel(row.user!.id, next.level, next.label)}
                      >
                        {next.label}
                      </button>
                    ))}
                  </div>
                ) : null,
            },
          ]}
        />
      </div>
    </div>
  );
}
