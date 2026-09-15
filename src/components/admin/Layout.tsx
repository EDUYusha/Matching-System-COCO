'use client';

import Link from 'next/link';
import { useSearchParams } from '@/client/navigation';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AN } from '@/lib';
import { api } from '@/client/admin-api';
import { useAdmin, useAdminStore } from '@/client/admin-store';

/**
 * The admin shell. The navigation follows admin/config/navi.php: the operational
 * screens first, then the settings group the PHP app kept in a submenu.
 */
const OPERATIONS = [
  { to: '/admin', label: 'ダッシュボード' },
  { to: '/admin/service_messages', label: 'お知らせ' },
  { to: '/admin/payout_requests', label: '出金申請（申請制）' },
  { to: '/admin/credit_conversions', label: '出金申請管理' },
  { to: '/admin/users?userType=cast', label: 'キャスト管理' },
  { to: '/admin/users?userType=customer', label: 'ゲスト管理' },
  { to: '/admin/access_requests', label: '本登録審査' },
  { to: '/admin/meetings', label: 'オーダー管理' },
  { to: '/admin/credit_transactions', label: 'ポイント取引' },
  { to: '/admin/conversations', label: 'チャット' },
  { to: '/admin/posts', label: 'つぶやき' },
  { to: '/admin/reviews', label: 'レビュー' },
  { to: '/admin/blockings', label: 'ブロック' },
  { to: '/admin/broadcast', label: '一斉送信' },
  { to: '/admin/rankings', label: 'ランキング' },
];

const SETTINGS = [
  { to: '/admin/settings/cast_ranks', label: '料金メニュー管理' },
  { to: '/admin/settings/trophies', label: 'トロフィー管理' },
  { to: '/admin/settings/sticker_templates', label: 'ギフトアイテム管理' },
  { to: '/admin/settings/event_campaigns', label: 'イベントキャンペーン' },
  { to: '/admin/settings/roulettes', label: 'ルーレット' },
  { to: '/admin/settings/roulette_entries', label: 'ルーレット内容' },
  { to: '/admin/settings/meeting_places', label: '協力店' },
  { to: '/admin/settings/meeting_place_tags', label: '協力店タグ' },
  { to: '/admin/settings/rewarding_rules', label: '紹介バック管理' },
  { to: '/admin/settings/banners', label: 'バナー管理' },
  { to: '/admin/settings/business_areas', label: '支店管理' },
  { to: '/admin/settings/areas', label: 'エリア管理' },
  { to: '/admin/settings/cast_levels', label: 'キャストレベル設定' },
  { to: '/admin/settings/customer_levels', label: 'お客様レベル設定' },
  { to: '/admin/settings/meeting_preferences_schema', label: 'マッチング項目設定' },
  { to: '/admin/settings/attributes_schema', label: 'プロフィール入力項目' },
  { to: '/admin/settings/highlightings', label: '特集枠' },
  { to: '/admin/settings/company_informations', label: '領収書表示項目設定' },
  { to: '/admin/settings/admins', label: '管理者' },
];

export function Layout({ children }: { children: ReactNode }): ReactNode {
  const admin = useAdmin();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setAdmin = useAdminStore((state) => state.setAdmin);

  async function logout(): Promise<void> {
    await api.post('/admin/logout');
    setAdmin(null);
    queryClient.clear();
    router.replace('/admin/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-4 py-3">
          <Link href="/admin" className="text-[15px] font-bold text-brand-600 no-underline hover:no-underline">
            {AN.Short} 管理画面
          </Link>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {admin?.loginName}
            {admin?.businessAreaName ? ` / ${admin.businessAreaName}` : ' / 全支店'}
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {OPERATIONS.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
          ))}
          <p className="mt-3 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">各種設定</p>
          {SETTINGS.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>

        <div className="border-t border-slate-200 p-2">
          <button type="button" className="btn-secondary w-full" onClick={() => void logout()}>
            ログアウト
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Toasts />
        <div className="mx-auto max-w-7xl p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ to, label }: { to: string; label: string }): ReactNode {
  // several entries differ only by their query string, so the active test looks
  // at both halves — react-router's NavLink ignored the query
  const pathname = usePathname();
  const currentSearch = useSearchParams()[0].toString();

  const [path, search = ''] = to.split('?');
  const active =
    (path === '/admin' ? pathname === '/admin' : pathname.startsWith(path)) &&
    (!search || currentSearch === search);

  return (
    <Link
      href={to}
      className={clsx('pill-nav no-underline hover:no-underline', active && 'pill-nav-active')}
    >
      {label}
    </Link>
  );
}

function Toasts(): ReactNode {
  const toasts = useAdminStore((state) => state.toasts);
  const dismiss = useAdminStore((state) => state.dismissToast);
  if (!toasts.length) return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-80 space-y-2">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={clsx(
            'block w-full rounded-md border px-3 py-2 text-left text-[12px] shadow-lg',
            toast.type === 'alert' || toast.type === 'danger'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700',
          )}
        >
          <span dangerouslySetInnerHTML={{ __html: toast.message }} />
        </button>
      ))}
    </div>
  );
}
