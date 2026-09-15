'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { ProfileDetail } from '@/lib';
import { numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { LevelBadge, Modal, PageHeader, PageLoading, RichText } from '@/components/ui';

/** ProfilesController#show, and #show_me via MyProfilePage. */
export function ProfilePage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useApiQuery<{ profile: ProfileDetail }>(
    ['profile', id],
    `/profiles/${id}`,
  );

  if (isLoading) return <PageLoading />;
  if (!data) return null;
  return <ProfileView profile={data.profile} onChanged={() => void refetch()} />;
}

export function ProfileView({
  profile,
  onChanged,
}: {
  profile: ProfileDetail;
  onChanged: () => void;
}): ReactNode {
  const router = useRouter();
  const user = useCurrentUser();
  const { run } = useAction();
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState(profile.memo ?? '');
  const [photoIndex, setPhotoIndex] = useState(0);

  const photos = profile.pictures.length
    ? profile.pictures
    : [{ id: 0, url: profile.profilePicUrl, profilePic: true, public: true }];

  async function openChat(withIntro: boolean): Promise<void> {
    await run(
      api.post<{ conversationId: number; redirect: string }>('/conversations', {
        userId: profile.id,
        withIntroMessage: withIntro,
      }),
      { invalidate: [['conversations']] },
    );
  }

  async function toggleFavorite(): Promise<void> {
    await api.post(`/profiles/${profile.id}/toggle_favorite`);
    onChanged();
  }

  async function block(): Promise<void> {
    if (!window.confirm(`${profile.nickName}さんをブロックしますか？`)) return;
    await run(api.post(`/user/blockings/${profile.id}`), { invalidate: [['conversations']] });
  }

  async function saveMemo(): Promise<void> {
    await api.patch(`/profiles/${profile.id}/memo`, { content: memo });
    setMemoOpen(false);
    onChanged();
  }

  return (
    <div>
      <PageHeader
        title={profile.isMe ? 'マイプロフィール' : profile.nickName}
        back={profile.isMe ? undefined : '/profiles/search'}
        action={
          profile.isMe ? (
            <Link href="/profile/settings" className="btn-secondary px-3 py-1.5 text-xs no-underline">
              編集
            </Link>
          ) : (
            <button type="button" className="p-1.5 text-xl" onClick={() => void toggleFavorite()} aria-label="お気に入り">
              {profile.favorited ? '★' : '☆'}
            </button>
          )
        }
      />

      <div className="relative">
        <img src={photos[photoIndex]?.url} alt={profile.nickName} className="aspect-square w-full object-cover" />
        {photos.length > 1 ? (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setPhotoIndex(index)}
                aria-label={`写真 ${index + 1}`}
                className={`h-1.5 w-1.5 rounded-full ${index === photoIndex ? 'bg-brand-500' : 'bg-white'}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{profile.nickName}</h2>
          {profile.online ? <span className="badge bg-emerald-500/20 text-emerald-600">オンライン</span> : null}
          {profile.available ? <span className="badge bg-brand-100 text-brand-700">待機中</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <LevelBadge level={profile.level} />
          {profile.birthdayPublished && profile.age !== null ? <span>{profile.age}歳</span> : null}
          {profile.guestTitle ? <span className="badge bg-brand-100 text-brand-700">{profile.guestTitle}</span> : null}
          {profile.individualRepeatCount > 0 ? <span>リピート {profile.individualRepeatCount}回</span> : null}
        </div>

        {profile.orderFeePerTime ? (
          <p className="mt-3 text-sm">
            <span className="text-ink-500">個TOLA料金 </span>
            <span className="font-bold text-brand-700">{numberToCredits(profile.orderFeePerTime)}</span>
            <span className="text-xs text-ink-500"> / 30分</span>
          </p>
        ) : null}

        {profile.priceSettings ? (
          <RichText html={profile.priceSettings} className="mt-2 text-xs text-ink-700" />
        ) : null}

        {profile.motto ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{profile.motto}</p> : null}

        {profile.reviewStats ? (
          <p className="mt-3 text-xs text-ink-500">
            評価 {'★'.repeat(Math.round(profile.reviewStats.average))}{' '}
            {profile.reviewStats.average.toFixed(1)}（{profile.reviewStats.count}件）
          </p>
        ) : null}
      </div>

      {!profile.isMe ? (
        <div className="space-y-2 px-4 pb-4">
          {profile.canChat ? (
            profile.acquaintanceConversationId ? (
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => router.push(`/conversations/${profile.acquaintanceConversationId}`)}
              >
                チャットを開く
              </button>
            ) : (
              <>
                <button type="button" className="btn-primary w-full" onClick={() => void openChat(false)}>
                  ♥ いいね（チャットルーム作成）
                </button>
                {user?.permissions.cast ? (
                  <button type="button" className="btn-secondary w-full" onClick={() => void openChat(true)}>
                    定型文を添えていいね
                  </button>
                ) : null}
              </>
            )
          ) : null}

          {user?.permissions.customer && profile.bookable && profile.acquaintanceConversationId ? (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => router.push(`/conversations/${profile.acquaintanceConversationId}`)}
            >
              個TOLAを依頼する
            </button>
          ) : null}

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 text-xs" onClick={() => setMemoOpen(true)}>
              メモ{profile.memo ? '（登録済）' : ''}
            </button>
            <button type="button" className="btn-ghost flex-1 text-xs text-red-600" onClick={() => void block()}>
              {profile.blockedByMe ? 'ブロック中' : 'ブロックする'}
            </button>
          </div>
        </div>
      ) : null}

      {profile.trophies.length ? (
        <section>
          <h3 className="section-title">トロフィー</h3>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {profile.trophies.map((trophy) => (
              <div key={trophy.id} className="w-16 shrink-0 text-center">
                <img src={trophy.imageUrl} alt={trophy.name} className="h-16 w-16 object-contain" />
                <p className="mt-1 text-[10px] text-ink-500">{trophy.name}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {profile.stickers.length ? (
        <section>
          <h3 className="section-title">もらったギフト</h3>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {profile.stickers.map((sticker) => (
              <div key={sticker.stickerTemplateId} className="w-16 shrink-0 text-center">
                <img src={sticker.pictureUrl} alt={sticker.name} className="h-16 w-16 object-contain" />
                <p className="text-[10px] text-brand-700">×{sticker.count}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {profile.attributeGroups.map((group) => (
        <section key={group.category}>
          <h3 className="section-title">{group.category}</h3>
          <dl className="divide-y divide-ink-200 border-y border-ink-200">
            {group.entries
              .filter((entry) => entry.value || profile.isMe)
              .map((entry) => (
                <div key={entry.id} className="flex gap-3 px-4 py-2.5">
                  <dt className="w-28 shrink-0 text-xs text-ink-500">{entry.name}</dt>
                  <dd className="min-w-0 flex-1 text-xs">
                    {entry.valueType === 'Text' && entry.value ? (
                      <RichText html={entry.value} />
                    ) : (
                      <span className={entry.value ? '' : 'text-ink-500'}>{entry.value || '未設定'}</span>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}

      {profile.meetingPreferences.some((preference) => preference.selected) ? (
        <section>
          <h3 className="section-title">マッチング項目</h3>
          <div className="flex flex-wrap gap-1.5 px-4 pb-4">
            {profile.meetingPreferences
              .filter((preference) => preference.selected)
              .map((preference) => (
                <span key={preference.id} className="badge border border-brand-300 bg-brand-100 text-brand-700">
                  {preference.name}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {profile.posts.length ? (
        <section>
          <h3 className="section-title">つぶやき</h3>
          <ul className="divide-y divide-ink-200 border-y border-ink-200">
            {profile.posts.map((post) => (
              <li key={post.id} className="px-4 py-3">
                <RichText html={post.content} className="text-xs leading-relaxed" />
                {post.pictures.length ? (
                  <div className="mt-2 flex gap-2">
                    {post.pictures.map((url) => (
                      <img key={url} src={url} alt="" className="h-20 w-20 rounded object-cover" />
                    ))}
                  </div>
                ) : null}
                <p className="mt-1 text-[10px] text-ink-500">♥ {post.postLikesCount}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={memoOpen}
        onClose={() => setMemoOpen(false)}
        title={`${profile.nickName}さんのメモ`}
        footer={
          <button type="button" className="btn-primary w-full" onClick={() => void saveMemo()}>
            保存する
          </button>
        }
      >
        <p className="mb-2 text-[11px] text-ink-500">このメモはあなたにだけ表示されます。</p>
        <textarea className="input min-h-32" value={memo} onChange={(event) => setMemo(event.target.value)} />
      </Modal>
    </div>
  );
}
