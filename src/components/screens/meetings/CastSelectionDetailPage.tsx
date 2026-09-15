'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import type { CastAttendanceDto, PictureDto, ProfileStickerCount } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Avatar, LevelBadge, PageHeader, PageLoading } from '@/components/ui';

interface Response {
  attendance: CastAttendanceDto;
  pictures: PictureDto[];
  team: CastAttendanceDto[];
  stickers: ProfileStickerCount[];
  reviewStats: { average: number; count: number } | null;
}

/** MeetingsController#show_cast — one candidate's detail during selection. */
export function CastSelectionDetailPage(): ReactNode {
  const { id, castAttendanceId } = useParams<{ id: string; castAttendanceId: string }>();
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<Response>(
    ['meeting', id, 'cast', castAttendanceId],
    `/meetings/${id}/cast/${castAttendanceId}`,
  );

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const user = data.attendance.user;
  if (!user) return null;

  async function select(): Promise<void> {
    await run(api.post<{ redirect: string }>(`/meetings/${id}/select_cast/${castAttendanceId}`), {
      invalidate: [['meeting', id], ['conversations']],
    });
  }

  return (
    <div>
      <PageHeader title={user.nickName} back={`/meetings/${id}`} />

      {data.pictures.length ? (
        <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto">
          {data.pictures.map((picture) => (
            <img
              key={picture.id}
              src={picture.url}
              alt=""
              className="aspect-square w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
      ) : (
        <img src={user.profilePicUrl} alt={user.nickName} className="aspect-square w-full object-cover" />
      )}

      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{user.nickName}</h2>
          <LevelBadge level={user.level} />
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink-500">
          {user.birthdayPublished && user.age !== null ? <span>{user.age}歳</span> : null}
          {data.attendance.timesMet && data.attendance.timesMet > 0 ? (
            <span className="text-gold-700">{data.attendance.timesMet}回ご一緒しています</span>
          ) : null}
        </div>
        {data.reviewStats ? (
          <p className="mt-2 text-xs text-ink-500">
            評価 {data.reviewStats.average.toFixed(1)}（{data.reviewStats.count}件）
          </p>
        ) : null}
        {user.motto ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{user.motto}</p> : null}
      </div>

      {Object.keys(user.attributes).length ? (
        <dl className="divide-y divide-ink-200 border-y border-ink-200">
          {Object.entries(user.attributes)
            .filter(([, value]) => !!value)
            .map(([name, value]) => (
              <div key={name} className="flex gap-3 px-4 py-2.5">
                <dt className="w-28 shrink-0 text-xs text-ink-500">{name}</dt>
                <dd className="flex-1 text-xs">{value}</dd>
              </div>
            ))}
        </dl>
      ) : null}

      {data.team.length > 1 ? (
        <section>
          <h3 className="section-title">一緒にエントリーしているキャスト</h3>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {data.team.map((member) =>
              member.user ? (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar src={member.user.profilePicUrl} alt={member.user.nickName} size="sm" />
                  <span className="text-sm">{member.user.nickName}</span>
                </li>
              ) : null,
            )}
          </ul>
          <p className="px-4 py-2 text-[11px] text-ink-500">
            チームでのエントリーです。選択すると全員が確定します。
          </p>
        </section>
      ) : null}

      {data.stickers.length ? (
        <section>
          <h3 className="section-title">もらったギフト</h3>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {data.stickers.map((sticker) => (
              <div key={sticker.stickerTemplateId} className="w-16 shrink-0 text-center">
                <img src={sticker.pictureUrl} alt={sticker.name} className="h-16 w-16 object-contain" />
                <p className="text-[10px] text-gold-700">×{sticker.count}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="px-4 py-5">
        <button type="button" className="btn-primary w-full" onClick={() => void select()}>
          このキャストを選ぶ
        </button>
      </div>
    </div>
  );
}
