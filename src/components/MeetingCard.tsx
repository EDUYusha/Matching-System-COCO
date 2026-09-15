'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MeetingSummary } from '@/lib';
import { formatCountdown, formatDurationMinutes, l, lShortWithWeekday, numberToCredits } from '@/client/format';
import { Avatar, LevelBadge } from '@/components/ui';

const STATUS_TONE: Record<string, string> = {
  requested: 'bg-emerald-500/20 text-emerald-600',
  cast_selectable: 'bg-gold-100 text-gold-700',
  cast_requested: 'bg-sky-500/20 text-sky-600',
  scheduled: 'bg-gold-100 text-gold-700',
  in_progress: 'bg-purple-500/20 text-purple-300',
  finished: 'bg-ink-200 text-ink-900',
  completed: 'bg-ink-200 text-ink-700',
};

/** The order row shared by the cast board, the guest's history and the admin list. */
export function MeetingCard({
  meeting,
  action,
  to,
}: {
  meeting: MeetingSummary;
  action?: ReactNode;
  to?: string;
}): ReactNode {
  const countdown = formatCountdown(meeting.requestEndTime);
  const tone = STATUS_TONE[meeting.status] ?? 'bg-red-500/20 text-red-600';

  const body = (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        {meeting.owner ? (
          <Avatar src={meeting.owner.profilePicUrl} alt={meeting.owner.nickName} />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-ink-300 bg-ink-100 text-lg">
            {meeting.anonymous ? '🎭' : '🍶'}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`badge ${tone}`}>{meeting.statusLabel}</span>
            {meeting.category === 'individual' ? (
              <span className="badge bg-pink-500/20 text-pink-300">個TOLA</span>
            ) : null}
            {countdown ? <span className="text-[10px] text-gold-700">{countdown}</span> : null}
          </div>

          <p className="mt-1 text-sm font-semibold">
            {meeting.areaName} · キャスト{meeting.neededPersonCount}名
            {meeting.minimumPersonCount ? `（最低${meeting.minimumPersonCount}名）` : ''}
          </p>
          <p className="text-[11px] text-ink-500">
            {lShortWithWeekday(meeting.plannedStartTime)} 〜 {formatDurationMinutes(meeting.plannedLengthMinutes)}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
            {meeting.castRank ? <span>{meeting.castRank.name}</span> : null}
            <span className="text-gold-700">
              {/* a settled order shows what it cost, a live one what it may cost */}
              {meeting.finalCosts !== null
                ? numberToCredits(meeting.finalCosts)
                : numberToCredits(meeting.estimatedCostsWithNightSurcharge)}
            </span>
            {meeting.estimatedNightSurcharge > 0 && meeting.finalCosts === null ? (
              <span className="text-[10px] text-ink-500">深夜手当込</span>
            ) : null}
            <span>
              応募 {meeting.attendanceCount}／確定 {meeting.attendingCount}
            </span>
          </div>

          {meeting.owner ? (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500">
              <span>{meeting.owner.nickName}</span>
              <LevelBadge level={meeting.owner.level} />
              {meeting.ownerAttributes['年収'] ? <span>{meeting.ownerAttributes['年収']}</span> : null}
            </div>
          ) : null}

          {meeting.description ? (
            <p className="mt-1 line-clamp-2 text-[11px] text-ink-500">{meeting.description}</p>
          ) : null}
        </div>
      </div>

      {action ? <div className="mt-3">{action}</div> : null}
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

/** The detail block the order-request and cast-selection screens share. */
export function MeetingDetails({ meeting }: { meeting: MeetingSummary }): ReactNode {
  const rows: Array<[string, string]> = [
    ['場所', meeting.areaName],
    ['開始', l(meeting.plannedStartTime)],
    ['終了', l(meeting.plannedEndTime)],
    ['時間', formatDurationMinutes(meeting.plannedLengthMinutes)],
    ['人数', `${meeting.neededPersonCount}名${meeting.minimumPersonCount ? `（最低${meeting.minimumPersonCount}名）` : ''}`],
    ...(meeting.castRank ? ([['料金メニュー', meeting.castRank.name]] as Array<[string, string]>) : []),
    ['概算料金', numberToCredits(meeting.estimatedCostsWithNightSurcharge)],
    ...(meeting.estimatedNightSurcharge > 0
      ? ([['深夜手当', numberToCredits(meeting.estimatedNightSurcharge)]] as Array<[string, string]>)
      : []),
    ...(meeting.finalCosts !== null
      ? ([['確定料金', numberToCredits(meeting.finalCosts)]] as Array<[string, string]>)
      : []),
  ];

  return (
    <dl className="divide-y divide-ink-200 border-y border-ink-200">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 px-4 py-2.5">
          <dt className="w-24 shrink-0 text-xs text-ink-500">{label}</dt>
          <dd className="flex-1 text-xs">{value}</dd>
        </div>
      ))}
      {meeting.description ? (
        <div className="px-4 py-2.5">
          <dt className="mb-1 text-xs text-ink-500">ゲストからのメッセージ</dt>
          <dd className="whitespace-pre-wrap text-xs leading-relaxed">{meeting.description}</dd>
        </div>
      ) : null}
    </dl>
  );
}
