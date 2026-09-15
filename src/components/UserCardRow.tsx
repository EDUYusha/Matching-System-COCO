'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { numberToCredits } from '@/client/format';
import { Avatar, LevelBadge, NO_IMAGE } from '@/components/ui';

/** The list row used by search, footprints, recommendations and the admin lists. */
export function UserCardRow({
  user,
  right,
  to,
  showFee = false,
}: {
  user: UserCard;
  right?: ReactNode;
  to?: string;
  showFee?: boolean;
}): ReactNode {
  const body = (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar src={user.profilePicUrl} alt={user.nickName} online={user.online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-ink-900">{user.nickName}</p>
          {user.isNew ? <span className="badge bg-emerald-500/20 text-emerald-600">新人</span> : null}
          {user.available ? <span className="badge bg-brand-100 text-brand-700">待機中</span> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
          <LevelBadge level={user.level} />
          {/* the age is hidden unless the member chose to publish it */}
          {user.birthdayPublished && user.age !== null ? <span>{user.age}歳</span> : null}
          {user.occupation ? <span>{user.occupation}</span> : null}
          {showFee && user.orderFeePerTime ? (
            <span className="text-brand-700">{numberToCredits(user.orderFeePerTime)}/30分</span>
          ) : null}
        </div>
        {user.daysElapsedLabel ? (
          <p className="mt-0.5 text-[11px] text-amber-600">{user.daysElapsedLabel}</p>
        ) : null}
        {user.motto ? <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">{user.motto}</p> : null}
      </div>
      {right}
    </div>
  );

  if (!to) return <li className="border-b border-ink-200">{body}</li>;
  return (
    <li className="border-b border-ink-200">
      <Link href={to} className="block no-underline hover:bg-ink-50">
        {body}
      </Link>
    </li>
  );
}

/** The square tile used by the home rail and the recommendation pickers. */
export function UserTile({
  user,
  selected,
  onToggle,
  to,
}: {
  user: UserCard;
  selected?: boolean;
  onToggle?: () => void;
  to?: string;
}): ReactNode {
  const inner = (
    <>
      <div className="relative">
        <img
          src={user.profilePicUrl?.trim() ? user.profilePicUrl : NO_IMAGE}
          alt={user.nickName}
          loading="lazy"
          // as Avatar does: a missing upload falls back to the placeholder
          onError={(event) => {
            const image = event.currentTarget;
            if (!image.src.endsWith(NO_IMAGE)) image.src = NO_IMAGE;
          }}
          className="aspect-square w-full rounded-lg bg-ink-100 object-cover"
        />
        {selected ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-brand-500/30 text-2xl">✓</span>
        ) : null}
        {user.available ? (
          <span className="absolute left-1 top-1 badge bg-brand-500 text-white">待機中</span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[11px] font-medium">{user.nickName}</p>
      <div className="flex items-center gap-1 text-[10px] text-ink-500">
        {user.birthdayPublished && user.age !== null ? <span>{user.age}歳</span> : null}
        {user.orderFeePerTime ? <span className="text-brand-700">{user.orderFeePerTime}P</span> : null}
      </div>
    </>
  );

  if (onToggle) {
    return (
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link href={to} className="block no-underline">
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}
