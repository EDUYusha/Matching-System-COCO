'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCurrentUser } from '@/client/store';
import { PageHeader } from '@/components/ui';

/** ProfilesController#settings — the hub for the profile editors. */
export function ProfileSettingsPage(): ReactNode {
  const user = useCurrentUser();

  const links = [
    { to: '/profile/edit_basics', label: '基本情報・写真', hint: 'ニックネーム、年齢、写真' },
    { to: '/profile/edit_attributes', label: 'プロフィール詳細編集', hint: '居住地、身長、自己紹介など' },
    ...(user?.permissions.cast
      ? [{ to: '/profile/edit_meeting_preferences', label: 'マッチング項目設定', hint: 'オーダーのマッチングに使用します' }]
      : []),
    { to: '/profile/footprints', label: '足あと', hint: 'プロフィールを見た方' },
    { to: '/intro_messages', label: 'いいね時の定型文', hint: 'チャットルーム作成時に自動送信' },
  ];

  return (
    <div>
      <PageHeader title="プロフィール設定" back="/profile" />
      <ul className="divide-y divide-ink-200 border-b border-ink-200">
        {links.map((link) => (
          <li key={link.to}>
            <Link href={link.to} className="flex items-center gap-3 px-4 py-3.5 no-underline hover:bg-ink-50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink-900">{link.label}</span>
                <span className="block text-[11px] text-ink-500">{link.hint}</span>
              </span>
              <span className="text-ink-500">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
