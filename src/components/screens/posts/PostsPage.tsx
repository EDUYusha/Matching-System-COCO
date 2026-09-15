'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { Paginated, PostDto, UserCard } from '@/lib';
import { config } from '@/lib';
import { formatRelative, numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { Avatar, EmptyState, Modal, PageHeader, PageLoading, Pagination, RichText, Tabs } from '@/components/ui';

interface PostsResponse extends Paginated<PostDto> {
  category: 'public' | 'cast_only';
  customerDaysElapsed: UserCard[];
  firstUnreadPostId: number | null;
  currentLikeCredits: number;
  biggestGift: {
    chargedAmount: number;
    createdAt: string;
    donor: { id: number; nickName: string; profilePicUrl: string; anonymous: boolean } | null;
    recipient: { id: number; nickName: string; profilePicUrl: string } | null;
    sticker: { name: string; pictureUrl: string } | null;
  } | null;
}

/** PostsController#index — the つぶやき timeline. */
export function PostsPage(): ReactNode {
  const user = useCurrentUser();
  const isCast = !!user?.permissions.cast;
  const [tab, setTab] = useState<'public' | 'cast_only'>('public');
  const [page, setPage] = useState(1);
  const [likersFor, setLikersFor] = useState<PostDto | null>(null);

  const { data, isLoading, refetch } = useApiQuery<PostsResponse>(
    ['posts', tab, page],
    `/posts?page=${page}${tab === 'cast_only' ? '&cast_only=1' : ''}`,
  );

  useEffect(() => {
    // PostsController#mark_read — moves the high-water mark on arrival
    const startedReadingAt = new Date().toISOString();
    void api.post('/posts/mark_read', { startedReadingAt }).catch(() => undefined);
  }, []);

  async function toggleLike(post: PostDto): Promise<void> {
    // cast may not un-like: they have already been credited for it
    if (post.likedByMe && isCast) return;
    await api.put(`/posts/${post.id}/${post.likedByMe ? 'unlike' : 'like'}`).catch(() => undefined);
    await refetch();
  }

  async function destroy(post: PostDto): Promise<void> {
    if (!window.confirm('このつぶやきを削除しますか？')) return;
    await api.delete(`/posts/${post.id}`);
    await refetch();
  }

  return (
    <div>
      <PageHeader
        title="つぶやき"
        subtitle={
          isCast && data ? `本日のいいねバック ${numberToCredits(data.currentLikeCredits)}` : undefined
        }
        action={
          <Link href="/posts/new" className="btn-secondary px-3 py-1.5 text-xs no-underline">
            投稿する
          </Link>
        }
      />

      {isCast ? (
        <Tabs
          tabs={[
            { value: 'public', label: 'みんな' },
            { value: 'cast_only', label: 'キャストのみ' },
          ]}
          active={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
        />
      ) : null}

      {data?.biggestGift ? (
        <div className="m-4 card border-brand-300 bg-brand-50">
          <p className="text-[10px] text-brand-700">直近8時間の最高額ギフト</p>
          <div className="mt-1 flex items-center gap-2">
            {data.biggestGift.sticker ? (
              <img src={data.biggestGift.sticker.pictureUrl} alt="" className="h-10 w-10 object-contain" />
            ) : null}
            <p className="min-w-0 flex-1 truncate text-xs">
              {data.biggestGift.donor?.nickName} → {data.biggestGift.recipient?.nickName}
            </p>
            <span className="text-sm font-bold text-brand-700">{numberToCredits(data.biggestGift.chargedAmount)}</span>
          </div>
        </div>
      ) : null}

      {isCast && data?.customerDaysElapsed.length ? (
        <section>
          <h2 className="section-title">久しぶりのゲスト</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-3">
            {data.customerDaysElapsed.map((guest) => (
              <Link key={guest.id} href={`/profiles/${guest.id}`} className="w-16 shrink-0 text-center no-underline">
                <Avatar src={guest.profilePicUrl} alt={guest.nickName} size="lg" />
                <p className="mt-1 truncate text-[10px]">{guest.nickName}</p>
                <p className="text-[9px] text-amber-600">{guest.daysElapsedLabel}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <PageLoading />
      ) : data?.items.length ? (
        <ul className="divide-y divide-ink-200 border-t border-ink-200">
          {data.items.map((post) => (
            <li key={post.id} id={post.id === data.firstUnreadPostId ? 'first-unread' : undefined} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <Link href={`/profiles/${post.user.id}`} className="shrink-0 no-underline">
                  <Avatar src={post.user.profilePicUrl} alt={post.user.nickName} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{post.user.nickName}</p>
                    {post.user.birthdayPublished && post.user.age !== null ? (
                      <span className="text-[10px] text-ink-500">{post.user.age}歳</span>
                    ) : null}
                    {post.category === 'cast_only' ? (
                      <span className="badge bg-purple-50 text-purple-700">キャストのみ</span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-ink-500">{formatRelative(post.createdAt)}</span>
                  </div>

                  <RichText html={post.content} className="mt-1 whitespace-pre-wrap text-sm leading-relaxed" />

                  {post.pictures.length ? (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {post.pictures.map((url) => (
                        <img key={url} src={url} alt="" className="aspect-square w-full rounded object-cover" />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void toggleLike(post)}
                      className={`flex items-center gap-1 text-xs ${post.likedByMe ? 'text-brand-700' : 'text-ink-500'}`}
                    >
                      {post.likedByMe ? '♥' : '♡'} {post.postLikesCount}
                    </button>

                    {config.show_users_who_liked_posts && post.usersWhoLiked.length ? (
                      <button
                        type="button"
                        onClick={() => setLikersFor(post)}
                        className="flex items-center gap-0.5"
                        aria-label="いいねした人"
                      >
                        {post.usersWhoLiked.slice(0, 5).map((liker) => (
                          <img
                            key={liker.id}
                            src={liker.profilePicUrl}
                            alt=""
                            className="h-5 w-5 rounded-full border border-ink-200 object-cover"
                          />
                        ))}
                      </button>
                    ) : null}

                    {post.isMine ? (
                      <button type="button" onClick={() => void destroy(post)} className="ml-auto text-xs text-red-600">
                        削除
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="つぶやきはまだありません" />
      )}

      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />

      <LikersModal post={likersFor} onClose={() => setLikersFor(null)} />
    </div>
  );
}

function LikersModal({ post, onClose }: { post: PostDto | null; onClose: () => void }): ReactNode {
  const [users, setUsers] = useState<PostDto['usersWhoLiked']>([]);

  useEffect(() => {
    if (!post) return;
    void api
      .get<{ users: PostDto['usersWhoLiked'] }>(`/posts/${post.id}/users_who_liked`)
      .then((data) => setUsers(data.users))
      .catch(() => setUsers(post.usersWhoLiked));
  }, [post]);

  if (!post) return null;

  return (
    <Modal open onClose={onClose} title={`いいねした方（${post.postLikesCount}）`}>
      <ul className="divide-y divide-ink-200">
        {users.map((liker) => (
          <li key={liker.id} className="flex items-center gap-3 py-2.5">
            <Avatar src={liker.profilePicUrl} alt={liker.nickName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{liker.nickName}</p>
              <p className="text-[11px] text-ink-500">
                {liker.levelName ?? ''} {liker.age !== null ? `${liker.age}歳` : ''}
              </p>
            </div>
            {!liker.anonymous ? (
              <Link href={`/profiles/${liker.id}`} className="text-xs" onClick={onClose}>
                見る
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
