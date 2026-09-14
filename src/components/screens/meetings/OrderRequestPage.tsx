'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { CastAttendanceDto, MeetingSummary } from '@/lib';
import { numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { Avatar, PageHeader, PageLoading } from '@/components/ui';
import { MeetingDetails } from '@/components/MeetingCard';

/**
 * MeetingsController#show_request — the individual-order confirmation screen,
 * used by whichever side has to answer.
 */
export function OrderRequestPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const user = useCurrentUser();
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{
    meeting: MeetingSummary;
    cast: CastAttendanceDto[];
    isOwner: boolean;
  }>(['meeting', id, 'request'], `/meetings/${id}/request`);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const { meeting, cast, isOwner } = data;

  // status decides who still owes an answer: 'requested' waits on the cast,
  // 'cast_requested' waits on the guest
  const awaitingMe =
    (meeting.status === 'cast_requested' && isOwner) ||
    (meeting.status === 'requested' && !isOwner && cast.some((attendance) => attendance.userId === user?.id));

  async function accept(): Promise<void> {
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/accept`), {
      invalidate: [['conversations'], ['meetings'], ['me']],
    });
  }

  async function refuse(): Promise<void> {
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/refuse`), {
      invalidate: [['conversations'], ['meetings']],
    });
  }

  async function cancel(): Promise<void> {
    if (!window.confirm('このリクエストを取り消しますか？')) return;
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/cancel_request`), {
      invalidate: [['conversations'], ['meetings']],
    });
  }

  return (
    <div>
      <PageHeader
        title="個TOLAのリクエスト"
        back={meeting.conversationId ? `/conversations/${meeting.conversationId}` : '/conversations'}
      />

      <div className="flex items-center gap-3 px-4 py-4">
        {cast[0]?.user ? (
          <>
            <Avatar src={cast[0].user.profilePicUrl} alt={cast[0].user.nickName} size="lg" />
            <div>
              <p className="text-sm font-semibold">{cast[0].user.nickName}</p>
              <p className="text-[11px] text-ink-500">
                {isOwner ? 'キャストからのリクエスト' : 'ゲストからのリクエスト'}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <MeetingDetails meeting={meeting} />

      <div className="px-4 py-4 text-[11px] leading-relaxed text-ink-500">
        <p>・個TOLAは0時以降の深夜料金はございません。</p>
        <p>・延長は{numberToCredits(meeting.prolongCostPerTime ?? 0)}／30分です。</p>
        <p>・リクエスト確定後のキャンセルはお受けできません。</p>
      </div>

      <div className="space-y-2 px-4 pb-8">
        {awaitingMe ? (
          <>
            <button type="button" className="btn-primary w-full" onClick={() => void accept()}>
              承認する
            </button>
            <button type="button" className="btn-secondary w-full" onClick={() => void refuse()}>
              辞退する
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-ink-500">
              {meeting.status === 'requested' ? 'キャストの承認をお待ちください' : 'ゲストの承認をお待ちください'}
            </p>
            <button type="button" className="btn-secondary w-full" onClick={() => void cancel()}>
              リクエストを取り消す
            </button>
          </>
        )}
      </div>
    </div>
  );
}
