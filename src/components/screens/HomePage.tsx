'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { numberToCredits } from '@/client/format';
import { useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { EmptyState, PageHeader, PageLoading } from '@/components/ui';
import { UserTile } from '@/components/UserCardRow';

interface HomeResponse {
  availableCast: UserCard[];
  banners: Array<{
    id: number;
    name: string | null;
    position: string | null;
    bannerPictureUrl: string;
    mainPictureUrl: string | null;
  }>;
}

/**
 * UsersController#home — the guest landing screen: the banners, the two order
 * entry points and the cast currently marked available.
 */
export function HomePage(): ReactNode {
  const user = useCurrentUser();
  const { data, isLoading } = useApiQuery<HomeResponse>(['home'], '/home');

  if (isLoading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="呼ぶ"
        subtitle={user ? `${numberToCredits(user.creditBalance)} 保有中` : undefined}
        action={
          <Link href="/financial/charge" className="btn-secondary px-3 py-1.5 text-xs no-underline">
            チャージ
          </Link>
        }
      />

      {data?.banners.length ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {data.banners.map((banner) => (
            <img
              key={banner.id}
              src={banner.bannerPictureUrl}
              alt={banner.name ?? ''}
              className="h-24 shrink-0 rounded-lg border border-ink-200 object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        <Link
          href="/meetings/new"
          className="card flex flex-col items-center gap-1 border-gold-300 bg-gold-50 py-6 no-underline"
        >
          <span className="text-2xl">🍻</span>
          <span className="text-sm font-bold text-gold-700">グループTOLA</span>
          <span className="text-[10px] text-ink-500">複数キャストを募集</span>
        </Link>
        <Link href="/profiles/search" className="card flex flex-col items-center gap-1 py-6 no-underline">
          <span className="text-2xl">💛</span>
          <span className="text-sm font-bold text-ink-900">個TOLA</span>
          <span className="text-[10px] text-ink-500">キャストを直接指名</span>
        </Link>
      </div>

      <h2 className="section-title">待機中のキャスト</h2>
      {data?.availableCast.length ? (
        <div className="grid grid-cols-3 gap-3 px-4 pb-6">
          {data.availableCast.map((cast) => (
            <UserTile key={cast.id} user={cast} to={`/profiles/${cast.id}`} />
          ))}
        </div>
      ) : (
        <EmptyState title="現在待機中のキャストはいません" hint="「探す」からお好みのキャストを見つけられます" />
      )}

      <div className="px-4 pb-6">
        <Link href="/profiles/ranking" className="btn-secondary w-full no-underline">
          ランキングを見る
        </Link>
      </div>
    </div>
  );
}
