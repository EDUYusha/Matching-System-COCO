'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { l, numberToCredits } from '@/client/format';
import { useApiQuery } from '@/client/hooks';
import { Avatar, PageHeader, PageLoading } from '@/components/ui';

interface Response {
  sticker: {
    id: number;
    createdAt: string;
    template: { id: number; name: string; pictureUrl: string; price: number };
    buyer: { id: number; nickName: string; profilePicUrl: string | null };
    recipient: { id: number; nickName: string; profilePicUrl: string | null };
    chargedAmount: number | null;
    creditedAmount: number | null;
  };
}

/** FinancialController#history_details_sticker. */
export function StickerDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useApiQuery<Response>(['sticker', id], `/financial/stickers/${id}`);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const { sticker } = data;

  return (
    <div>
      <PageHeader title="ギフトの詳細" back="/financial/history" />

      <div className="px-4 py-6 text-center">
        <img src={sticker.template.pictureUrl} alt={sticker.template.name} className="mx-auto h-28 w-28 object-contain" />
        <p className="mt-2 text-sm font-semibold">{sticker.template.name}</p>
        <p className="text-xs text-ink-500">{l(sticker.createdAt)}</p>
      </div>

      <dl className="divide-y divide-ink-200 border-y border-ink-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <dt className="w-20 shrink-0 text-xs text-ink-500">贈った方</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar src={sticker.buyer.profilePicUrl ?? '/system/noimage.png'} alt={sticker.buyer.nickName} size="sm" />
            <span className="truncate text-sm">{sticker.buyer.nickName}</span>
          </dd>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <dt className="w-20 shrink-0 text-xs text-ink-500">受け取った方</dt>
          <dd className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar
              src={sticker.recipient.profilePicUrl ?? '/system/noimage.png'}
              alt={sticker.recipient.nickName}
              size="sm"
            />
            <span className="truncate text-sm">{sticker.recipient.nickName}</span>
          </dd>
        </div>
        <div className="flex gap-3 px-4 py-3">
          <dt className="w-20 shrink-0 text-xs text-ink-500">使用ポイント</dt>
          <dd className="flex-1 text-sm">{numberToCredits(sticker.chargedAmount ?? sticker.template.price)}</dd>
        </div>
        {sticker.creditedAmount !== null ? (
          <div className="flex gap-3 px-4 py-3">
            <dt className="w-20 shrink-0 text-xs text-ink-500">獲得ポイント</dt>
            <dd className="flex-1 text-sm font-semibold text-brand-700">{numberToCredits(sticker.creditedAmount)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
