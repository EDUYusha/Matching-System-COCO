'use client';

import { useSearchParams } from '@/client/navigation';
import type { ReactNode } from 'react';
import type { CastAttendanceDto, MeetingSummary } from '@/lib';
import { l, numberToCredits } from '@/client/format';
import { useApiQuery } from '@/client/hooks';
import { Avatar, PageHeader, PageLoading } from '@/components/ui';
import { MeetingDetails } from '@/components/MeetingCard';

interface Response {
  meeting: MeetingSummary;
  attendances: CastAttendanceDto[];
  total: number;
  isOwner: boolean;
}

/**
 * FinancialController#history_details_meeting — the cost breakdown.
 *
 * The four buckets (base, prolong, night, selection) are exactly the ones
 * CalculateMeetingCosts produces, so the guest can see how the figure was reached.
 */
export function MeetingCostsPage(): ReactNode {
  const [searchParams] = useSearchParams();
  const meetingId = searchParams.get('meeting_id');

  const { data, isLoading } = useApiQuery<Response>(
    ['meeting', meetingId, 'costs'],
    `/meetings/${meetingId}/costs`,
  );

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="合流ポイントの詳細" back="/financial/history" />
      <MeetingDetails meeting={data.meeting} />

      <h2 className="section-title">キャストごとの内訳</h2>
      <ul className="divide-y divide-ink-200 border-y border-ink-200">
        {data.attendances.map((attendance) => (
          <li key={attendance.id} className="px-4 py-3">
            <div className="flex items-center gap-3">
              {attendance.user ? (
                <Avatar src={attendance.user.profilePicUrl} alt={attendance.user.nickName} size="sm" />
              ) : null}
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{attendance.user?.nickName}</p>
              <span className="shrink-0 text-sm font-bold text-gold-700">
                {numberToCredits(attendance.costs?.total ?? 0)}
              </span>
            </div>

            <dl className="mt-2 space-y-1 text-[11px] text-ink-500">
              <Row label="基本料金" value={attendance.costs?.base ?? 0} />
              {attendance.costs?.prolong ? <Row label="延長料金" value={attendance.costs.prolong} /> : null}
              {attendance.costs?.night ? <Row label="深夜手当" value={attendance.costs.night} /> : null}
              {attendance.costs?.selection ? <Row label="指名料" value={attendance.costs.selection} /> : null}
              {!data.isOwner && attendance.earnings !== null ? (
                <Row label="獲得ポイント" value={attendance.earnings} emphasis />
              ) : null}
            </dl>

            <p className="mt-1.5 text-[10px] text-ink-500">
              {attendance.startTime ? l(attendance.startTime) : '開始記録なし'} 〜{' '}
              {attendance.endTime ? l(attendance.endTime) : '終了記録なし'}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm">合計</span>
        <span className="text-lg font-bold text-gold-700">{numberToCredits(data.total)}</span>
      </div>

      {data.meeting.finalDiscount > 0 ? (
        <p className="px-4 pb-6 text-[11px] text-emerald-600">
          運営による割引 −{numberToCredits(data.meeting.finalDiscount)} が適用されています。
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }): ReactNode {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={emphasis ? 'font-semibold text-gold-700' : ''}>{numberToCredits(value)}</dd>
    </div>
  );
}
