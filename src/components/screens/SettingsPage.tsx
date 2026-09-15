'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AN, config } from '@/lib';
import type { ServiceMessageDto, UserCard } from '@/lib';
import { l, numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useAppStore, useCurrentUser } from '@/client/store';
import { ChevronRightIcon } from '@/components/icons';
import { Avatar, LevelBadge, PageHeader, PageLoading, RichText } from '@/components/ui';

interface SettingsResponse {
  patronizedCast: UserCard[];
  lastTransactionAt: string | null;
  patron: UserCard | null;
  firstCustomers: UserCard[];
  serviceMessages: ServiceMessageDto[];
}

/**
 * UsersController#settings — my page, laid out as LINE's settings: white
 * groups of rows on a grey ground, each group under a small grey heading.
 */
export function SettingsPage(): ReactNode {
  const user = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setUser = useAppStore((state) => state.setUser);
  const pushToast = useAppStore((state) => state.pushToast);

  const { data, isLoading } = useApiQuery<SettingsResponse>(['user', 'settings'], '/user/settings');

  if (isLoading || !user) return <PageLoading />;

  async function logout(): Promise<void> {
    const result = await api.post<{ redirect: string; flash: { type: 'notice'; message: string } }>('/logout');
    setUser(null, null);
    queryClient.clear();
    pushToast(result.flash);
    router.replace(result.redirect);
  }

  const invitationUrl = `${window.location.origin}/register?inviter_code=${user.invitationCode}`;

  const moneyLinks = user.permissions.cast
    ? [
        { to: '/financial/history', label: '売上履歴一覧' },
        { to: '/financial/payout', label: '出金申請' },
        { to: '/financial/bank_account', label: '振込先口座' },
      ]
    : [
        { to: '/financial/history', label: 'ポイント履歴・領収書' },
        { to: '/financial/charge', label: 'ポイントを購入' },
        { to: '/financial/credit_card', label: 'お支払い情報' },
      ];

  return (
    <div className="min-h-full bg-paper-200 pb-2">
      <PageHeader title="マイページ" />

      <div className="bg-white px-4 pb-4 pt-1">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="shrink-0 no-underline">
            <Avatar src={user.profilePicUrl} alt={user.nickName} size="lg" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-ink-900">{user.nickName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
              <LevelBadge level={user.castLevel ?? user.customerLevel} />
              {user.guestTitle ? <span className="badge bg-brand-50 text-brand-700">{user.guestTitle}</span> : null}
              {user.businessAreaName ? <span>{user.businessAreaName}</span> : null}
            </div>
          </div>
          <Link href="/profile" className="btn-secondary shrink-0 rounded-full px-3.5 py-1.5 text-xs no-underline">
            プロフィール
          </Link>
        </div>

        <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3">
          <p className="text-[11px] font-bold text-brand-800">{user.permissions.cast ? '獲得ポイント' : '保有ポイント'}</p>
          <p className="text-2xl font-bold text-ink-900">{numberToCredits(user.creditBalance)}</p>
          {user.frozenCredits > 0 ? (
            <p className="text-[11px] text-ink-600">（うち {numberToCredits(user.frozenCredits)} は予約中）</p>
          ) : null}
        </div>
      </div>

      {data?.serviceMessages.length ? (
        <section className="mt-2 bg-white">
          <h2 className="section-title pt-3">運営局からのお知らせ</h2>
          <ul className="divide-y divide-ink-100">
            {data.serviceMessages.map((message) => (
              <li key={message.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {message.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" /> : null}
                  <p className="min-w-0 truncate text-sm font-bold">{message.title ?? 'お知らせ'}</p>
                  <span className="ml-auto shrink-0 text-[10px] text-ink-500">{l(message.createdAt)}</span>
                </div>
                {message.content ? (
                  <RichText html={message.content} className="mt-1 text-[12px] leading-relaxed text-ink-600" />
                ) : null}
              </li>
            ))}
          </ul>
          <SettingsRow to="/service_messages" label="すべてのお知らせを見る" />
        </section>
      ) : null}

      <SettingsGroup title={user.permissions.cast ? '売上・出金' : 'ポイント'} links={moneyLinks} />

      {/* the 師弟 (master/apprentice) relationship, from RewardPatron */}
      {data?.patron ? (
        <section className="mt-2 bg-white">
          <h2 className="section-title pt-3">師匠</h2>
          <Link
            href={`/profiles/${data.patron.id}`}
            className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-ink-50"
          >
            <Avatar src={data.patron.profilePicUrl} alt={data.patron.nickName} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink-900">{data.patron.nickName}</span>
            <ChevronRightIcon className="h-4 w-4 text-ink-400" strokeWidth={2.2} />
          </Link>
        </section>
      ) : null}

      {data?.patronizedCast.length ? (
        <section className="mt-2 bg-white">
          <h2 className="section-title pt-3">弟子キャスト（{data.patronizedCast.length}名）</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {data.patronizedCast.map((cast) => (
              <Link key={cast.id} href={`/profiles/${cast.id}`} className="w-16 shrink-0 text-center no-underline">
                <Avatar src={cast.profilePicUrl} alt={cast.nickName} size="lg" />
                <p className="mt-1 truncate text-[11px] text-ink-800">{cast.nickName}</p>
              </Link>
            ))}
          </div>
          <p className="px-4 pb-3 text-[11px] text-ink-500">
            弟子キャストがオーダーを実施すると、獲得ポイントの3.0%が付与されます。
          </p>
        </section>
      ) : null}

      {data?.firstCustomers.length ? (
        <section className="mt-2 bg-white">
          <h2 className="section-title pt-3">初個TOLAのゲスト（{data.firstCustomers.length}名）</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {data.firstCustomers.map((guest) => (
              <Link key={guest.id} href={`/profiles/${guest.id}`} className="w-16 shrink-0 text-center no-underline">
                <Avatar src={guest.profilePicUrl} alt={guest.nickName} size="lg" />
                <p className="mt-1 truncate text-[11px] text-ink-800">{guest.nickName}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-2 bg-white px-4 pb-4">
        <h2 className="section-title px-0 pt-3">友達を紹介する</h2>
        <p className="text-[11px] text-ink-500">あなたの紹介者コード</p>
        <p className="mt-0.5 font-mono text-xl tracking-widest text-ink-900">{user.invitationCode}</p>
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          onClick={() => {
            void navigator.clipboard.writeText(invitationUrl);
            pushToast({ type: 'success', message: '紹介リンクをコピーしました。' });
          }}
        >
          紹介リンクをコピー
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          紹介したゲストにはお試しポイント{config.customer_start_credits_invited}Pが付与され、
          ご利用のたびに紹介ポイントが還元されます。
        </p>
      </section>

      <SettingsGroup
        title="アカウント"
        links={[
          { to: '/profile/settings', label: 'プロフィール設定' },
          { to: '/user/notification_settings', label: '通知・公開設定' },
          { to: '/user/password', label: 'パスワード変更' },
          { to: '/user/phone_number', label: '電話番号' },
          { to: '/user/add_login_method', label: 'ログイン方法を追加' },
          { to: '/user/blockings', label: 'ブロックリスト' },
          ...(config.friends_functionality ? [{ to: '/friendships', label: 'お友達' }] : []),
          ...(config.meeting_places_functionality ? [{ to: '/meeting_places', label: '協力店' }] : []),
        ]}
      />

      {user.permissions.cast && !user.gates.order ? (
        <SettingsGroup
          title="キャスト本登録"
          links={[
            { to: '/cast/identity_check', label: '身分証明書のアップロード' },
            { to: '/cast/agreement', label: '同意書の提出' },
          ]}
        />
      ) : null}

      <SettingsGroup
        title="ヘルプ"
        links={[
          { to: '/help', label: 'ヘルプ・お問い合わせ' },
          { to: '/faq', label: 'よくある質問' },
          { to: '/usage_terms', label: '利用規約' },
          { to: '/privacy_policy', label: 'プライバシーポリシー' },
          { to: '/trade_terms', label: '特定商取引法に基づく表記' },
        ]}
      />

      <div className="mt-2 bg-white">
        <button
          type="button"
          className="block w-full px-4 py-3.5 text-left text-[15px] text-red-600 hover:bg-ink-50"
          onClick={() => void logout()}
        >
          ログアウト
        </button>
      </div>

      <p className="px-4 py-5 text-center text-[10px] text-ink-500">
        {AN.Full}
        <br />
        {AN.Company}
      </p>
    </div>
  );
}

function SettingsGroup({
  title,
  links,
}: {
  title: string;
  links: Array<{ to: string; label: string }>;
}): ReactNode {
  return (
    <section className="mt-2 bg-white">
      <h2 className="section-title pt-3">{title}</h2>
      <ul className="divide-y divide-ink-100">
        {links.map((link) => (
          <li key={link.to}>
            <SettingsRow to={link.to} label={link.label} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SettingsRow({ to, label }: { to: string; label: string }): ReactNode {
  return (
    <Link href={to} className="flex items-center px-4 py-3.5 no-underline hover:bg-ink-50">
      <span className="flex-1 text-[15px] text-ink-900">{label}</span>
      <ChevronRightIcon className="h-4 w-4 text-ink-400" strokeWidth={2.2} />
    </Link>
  );
}
