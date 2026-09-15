'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { CastAttendanceDto, MeetingSummary } from '@/lib';
import { formatCountdown, numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Avatar, EmptyState, LevelBadge, PageHeader, PageLoading } from '@/components/ui';
import { MeetingDetails } from '@/components/MeetingCard';

/**
 * MeetingsController#show — the guest picks from the cast who entered.
 *
 * `timesMet` comes from the correlated subquery the Meeting model built, so the
 * guest can see who they have already met.
 */
export function CastSelectionPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { run } = useAction();
  const { data, isLoading, refetch } = useApiQuery<{ meeting: MeetingSummary; cast: CastAttendanceDto[] }>(
    ['meeting', id],
    `/meetings/${id}`,
  );

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const { meeting, cast } = data;
  const attending = cast.filter((attendance) => attendance.role === 'attending');
  const pending = cast.filter((attendance) => attendance.role === 'unconfirmed');
  const remaining = meeting.neededPersonCount - attending.length;

  async function select(attendance: CastAttendanceDto): Promise<void> {
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/select_cast/${attendance.id}`), {
      invalidate: [['meeting', id], ['conversations'], ['meetings']],
    });
    await refetch();
  }

  async function openNow(): Promise<void> {
    if (!window.confirm('現在エントリーしているキャストで確定しますか？')) return;
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/open`), {
      invalidate: [['conversations'], ['meetings']],
    });
  }

  return (
    <div>
      <PageHeader
        title="キャストを選ぶ"
        subtitle={formatCountdown(meeting.requestEndTime) ?? undefined}
        back="/home"
      />

      <MeetingDetails meeting={meeting} />

      <div className="card m-4 border-brand-300 bg-brand-50 text-xs">
        <p>
          あと <span className="text-base font-bold text-brand-700">{Math.max(remaining, 0)}</span> 名選択できます。
        </p>
        <p className="mt-1 text-[11px] text-ink-500">
          締切までに選択しない場合は自動でマッチングされます。ご自身で選択すると、1名につき
          {numberToCredits(2000)}の指名料が加算されます。
        </p>
      </div>

      {attending.length ? (
        <section>
          <h2 className="section-title">確定したキャスト</h2>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {attending.map((attendance) => (
              <CastRow key={attendance.id} attendance={attendance} meetingId={meeting.id} />
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="section-title">エントリー中のキャスト（{pending.length}名）</h2>
      {pending.length ? (
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {pending.map((attendance) => (
            <CastRow
              key={attendance.id}
              attendance={attendance}
              meetingId={meeting.id}
              action={
                remaining > 0 ? (
                  <button type="button" className="btn-primary shrink-0 px-3 py-1.5 text-xs" onClick={() => void select(attendance)}>
                    選ぶ
                  </button>
                ) : null
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState title="まだエントリーがありません" hint="キャストのエントリーをお待ちください" />
      )}

      {attending.length > 0 ? (
        <div className="px-4 py-5">
          <button type="button" className="btn-secondary w-full" onClick={() => void openNow()}>
            この{attending.length}名で確定する
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CastRow({
  attendance,
  meetingId,
  action,
}: {
  attendance: CastAttendanceDto;
  meetingId: number;
  action?: ReactNode;
}): ReactNode {
  const user = attendance.user;
  if (!user) return null;

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/meetings/${meetingId}/show_cast/${attendance.id}`} className="shrink-0 no-underline">
          <Avatar src={user.profilePicUrl} alt={user.nickName} online={user.online} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/meetings/${meetingId}/show_cast/${attendance.id}`} className="block truncate text-sm font-semibold no-underline">
            {user.nickName}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-500">
            <LevelBadge level={user.level} />
            {user.birthdayPublished && user.age !== null ? <span>{user.age}歳</span> : null}
            {attendance.timesMet && attendance.timesMet > 0 ? (
              <span className="text-brand-700">{attendance.timesMet}回ご一緒</span>
            ) : null}
            {attendance.leaderId ? <span className="badge bg-sky-500/20 text-sky-600">チーム</span> : null}
          </div>
          {user.attributes['身長'] ? (
            <p className="text-[11px] text-ink-500">
              {user.attributes['身長']}cm {user.attributes['スタイル'] ?? ''}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </li>
  );
}
