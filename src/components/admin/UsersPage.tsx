'use client';

import Link from 'next/link';
import { useSearchParams } from '@/client/navigation';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { numberToCredits } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, PageTitle, Pagination } from '@/components/admin/ui';

interface AdminUserRow {
  id: number;
  nickName: string;
  realName: string | null;
  email: string | null;
  phone: string | null;
  userType: string;
  accessLevel: string;
  creditBalance: number;
  frozenCredits: number;
  serviceFeePermille: number | null;
  orderFeePerTime: number | null;
  businessAreaName: string | null;
  level: { name: string } | null;
  discardedAt: string | null;
  inviterId: number | null;
  adSource: string | null;
  daysElapsed: number | null;
  createdAt: string;
  online: boolean;
}

const ACCESS_LEVELS = [
  'rejected',
  'ceased',
  'unauthorized',
  'picture_uploaded',
  'interview_date_pending',
  'interview_pending',
  'contract_pending',
  'contract_accepted',
  'full',
];

/** Users#castIndex / #customerIndex / #introducerIndex, and the CSV exports. */
export function UsersPage(): ReactNode {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const userType = searchParams.get('userType') ?? '';
  const accessLevel = searchParams.get('accessLevel') ?? '';
  const q = searchParams.get('q') ?? '';
  const discarded = searchParams.get('discarded') ?? '';

  const { data, isLoading } = useAdminQuery<Paginated<AdminUserRow>>(
    ['admin', 'users', userType, accessLevel, q, discarded, page],
    `/admin/users${query({ userType, accessLevel, q, discarded, page })}`,
  );

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
    setPage(1);
  }

  const title =
    userType === 'cast' ? 'キャスト管理' : userType === 'customer' ? 'ゲスト管理' : 'ユーザー管理';

  return (
    <div>
      <PageTitle
        title={title}
        subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`}
        actions={
          <button type="button" className="btn-secondary" onClick={() => api.download(`/admin/users.csv${query({ userType })}`)}>
            CSVダウンロード
          </button>
        }
      />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-4">
        <Field label="検索">
          <input
            className="input"
            placeholder="ID・ニックネーム・本名・メール・電話"
            defaultValue={q}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setParam('q', (event.target as HTMLInputElement).value);
            }}
          />
        </Field>
        <Field label="種別">
          <select className="input" value={userType} onChange={(event) => setParam('userType', event.target.value)}>
            <option value="">すべて</option>
            <option value="cast">キャスト</option>
            <option value="customer">ゲスト</option>
            <option value="inviter">紹介者</option>
            <option value="operator">オペレーター</option>
            <option value="admin">管理者</option>
          </select>
        </Field>
        <Field label="登録状況">
          <select className="input" value={accessLevel} onChange={(event) => setParam('accessLevel', event.target.value)}>
            <option value="">すべて</option>
            {ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
        <Field label="削除済み">
          <select className="input" value={discarded} onChange={(event) => setParam('discarded', event.target.value)}>
            <option value="">除外する</option>
            <option value="1">削除済みのみ</option>
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
              columns={[
                { header: 'ID', cell: (row) => <Link href={`/users/${row.id}`}>{row.id}</Link> },
                {
                  header: 'ニックネーム',
                  cell: (row) => (
                    <div>
                      <Link href={`/users/${row.id}`}>{row.nickName}</Link>
                      {row.discardedAt ? <Badge tone="bad">削除</Badge> : null}
                      {row.online ? <Badge tone="ok">在線</Badge> : null}
                      {row.realName ? <p className="text-[11px] text-slate-400">{row.realName}</p> : null}
                    </div>
                  ),
                },
                { header: '種別', cell: (row) => row.userType },
                {
                  header: '登録状況',
                  cell: (row) => (
                    <Badge tone={row.accessLevel === 'full' ? 'ok' : row.accessLevel === 'rejected' ? 'bad' : 'warn'}>
                      {row.accessLevel}
                    </Badge>
                  ),
                },
                { header: 'レベル', cell: (row) => row.level?.name ?? '—' },
                { header: '支店', cell: (row) => row.businessAreaName ?? '—' },
                {
                  header: 'ポイント',
                  className: 'text-right',
                  cell: (row) => (
                    <div className="text-right">
                      <p>{numberToCredits(row.creditBalance)}</p>
                      {row.frozenCredits > 0 ? (
                        <p className="text-[11px] text-slate-400">予約 {numberToCredits(row.frozenCredits)}</p>
                      ) : null}
                    </div>
                  ),
                },
                {
                  header: 'バック率／料金',
                  className: 'text-right',
                  cell: (row) => (
                    <div className="text-right">
                      {row.serviceFeePermille !== null ? <p>{row.serviceFeePermille / 10}%</p> : null}
                      {row.orderFeePerTime !== null ? (
                        <p className="text-[11px] text-slate-400">{numberToCredits(row.orderFeePerTime)}</p>
                      ) : null}
                    </div>
                  ),
                },
                { header: '連絡先', cell: (row) => <div className="text-[11px]">{row.email ?? ''}<br />{row.phone ?? ''}</div> },
                { header: '流入', cell: (row) => row.adSource ?? '—' },
              ]}
            />
            <Pagination
              page={page}
              totalPages={data?.totalPages ?? 1}
              totalCount={data?.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
