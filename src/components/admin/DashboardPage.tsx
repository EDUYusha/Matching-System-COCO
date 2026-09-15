'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { numberToCredits, numberToYen } from '@/lib';
import { useAdminQuery } from '@/client/admin-hooks';
import { Badge, Loading, PageTitle } from '@/components/admin/ui';

interface Dashboard {
  castCount: number;
  customerCount: number;
  openMeetings: number;
  pendingPayouts: number;
  unreadInquiries: number;
  companyBalance: number;
  castByAccessLevel: Array<{ accessLevel: string; count: number }>;
}

const ACCESS_LABELS: Record<string, string> = {
  rejected: '却下',
  ceased: '停止',
  unauthorized: '未認証',
  picture_uploaded: '身分証提出済',
  interview_date_pending: '面接日調整中',
  interview_pending: '面接待ち',
  contract_pending: '同意書待ち',
  contract_accepted: '同意書提出済',
  full: '本登録済',
};

/** Pages#businessAreaAdminTop — the operator's landing figures. */
export function DashboardPage(): ReactNode {
  const { data, isLoading } = useAdminQuery<Dashboard>(['admin', 'dashboard'], '/admin/dashboard');
  if (isLoading) return <Loading />;

  const tiles = [
    { label: 'キャスト', value: data?.castCount ?? 0, to: '/admin/users?userType=cast' },
    { label: 'ゲスト', value: data?.customerCount ?? 0, to: '/admin/users?userType=customer' },
    { label: '進行中のオーダー', value: data?.openMeetings ?? 0, to: '/admin/meetings' },
    { label: '未処理の出金申請', value: data?.pendingPayouts ?? 0, to: '/admin/payout_requests' },
    { label: '未読のお問い合わせ', value: data?.unreadInquiries ?? 0, to: '/admin/conversations' },
  ];

  return (
    <div>
      <PageTitle title="ダッシュボード" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.to} className="card p-4 no-underline hover:shadow-md hover:no-underline">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{tile.value.toLocaleString()}</p>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">会社残高</h2>
          <p className="text-2xl font-bold text-brand-600">{numberToYen(data?.companyBalance ?? 0)}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            ポイント売上と出金の差額です。取引ごとの履歴は
            <Link href="/admin/credit_conversions" className="ml-1">
              出金申請管理
            </Link>
            から確認できます。
          </p>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 text-[13px] font-bold">キャストの登録状況</h2>
          <ul className="space-y-1.5">
            {data?.castByAccessLevel
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <li key={row.accessLevel} className="flex items-center gap-2">
                  <Badge tone={row.accessLevel === 'full' ? 'ok' : row.accessLevel === 'rejected' ? 'bad' : 'warn'}>
                    {ACCESS_LABELS[row.accessLevel] ?? row.accessLevel}
                  </Badge>
                  <span className="text-[12px] text-slate-600">{row.count.toLocaleString()} 名</span>
                </li>
              ))}
          </ul>
          <Link href="/admin/access_requests" className="mt-3 block text-[12px]">
            本登録審査へ
          </Link>
        </section>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        ポイントは {numberToCredits(1000)} = {numberToYen(1100)}（税込）で換算されます。
      </p>
    </div>
  );
}
