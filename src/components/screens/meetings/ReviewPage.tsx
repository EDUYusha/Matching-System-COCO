'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { MeetingSummary, StickerTemplateDto, UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { Avatar, PageHeader, PageLoading, Spinner } from '@/components/ui';

interface ReviewRow {
  revieweeId: number;
  reviewee: UserCard | null;
  stars: number | null;
  comment: string | null;
  persisted: boolean;
}

interface Response {
  meeting: MeetingSummary;
  reviews: ReviewRow[];
  stickerTemplates: StickerTemplateDto[];
}

/**
 * MeetingsController#review / #send_review.
 *
 * A cast reviewing a guest may attach a free badge sticker, which is the only
 * path where a cast sends a sticker (GiveSticker enforces that).
 */
export function ReviewPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<Response>(['meeting', id, 'review'], `/meetings/${id}/review`);

  const [entries, setEntries] = useState<Record<number, { stars: number; comment: string; stickerId: number | null }>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    const initial: Record<number, { stars: number; comment: string; stickerId: number | null }> = {};
    for (const review of data.reviews) {
      if (review.persisted) continue;
      initial[review.revieweeId] = { stars: review.stars ?? 5, comment: review.comment ?? '', stickerId: null };
    }
    setEntries(initial);
  }, [data]);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const pending = data.reviews.filter((review) => !review.persisted);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>(`/meetings/${id}/review`, {
        reviews: Object.entries(entries).map(([revieweeId, entry]) => ({
          revieweeId: Number(revieweeId),
          stars: entry.stars,
          comment: entry.comment,
          stickerId: entry.stickerId,
        })),
      }),
      { invalidate: [['conversations'], ['meetings']] },
    );
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader
        title="レビュー"
        back={data.meeting.conversationId ? `/conversations/${data.meeting.conversationId}` : '/conversations'}
      />

      <div className="px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        <p className="mb-1 font-semibold text-ink-900">評価基準</p>
        <p>星5　非常に気を遣ってくれて凄く楽しかった</p>
        <p>星4　良いゲストさんでまた参加したい</p>
        <p>星3　いい方だが、ちょっと気を遣う</p>
        <p>星2　印象があまり良くなくて今後も参加したくない</p>
        <p>星1　凍結してほしいぐらい印象が悪い</p>
      </div>

      {pending.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-ink-700">
          このオーダーのレビューは完了しています。ありがとうございました。
        </div>
      ) : (
        <form onSubmit={submit} className="pb-10">
          {pending.map((review) => {
            const entry = entries[review.revieweeId];
            if (!entry) return null;
            return (
              <section key={review.revieweeId} className="border-b border-ink-200 px-4 py-4">
                <div className="flex items-center gap-3">
                  {review.reviewee ? (
                    <Avatar src={review.reviewee.profilePicUrl} alt={review.reviewee.nickName} />
                  ) : null}
                  <p className="text-sm font-semibold">{review.reviewee?.nickName ?? `ユーザー${review.revieweeId}`}</p>
                </div>

                <div className="mt-3 flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setEntries({ ...entries, [review.revieweeId]: { ...entry, stars: star } })
                      }
                      className={`text-3xl leading-none ${star <= entry.stars ? 'text-brand-700' : 'text-ink-600'}`}
                      aria-label={`星${star}`}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <textarea
                  className="input mt-3 min-h-24"
                  placeholder="コメントを入力してください"
                  value={entry.comment}
                  onChange={(event) =>
                    setEntries({ ...entries, [review.revieweeId]: { ...entry, comment: event.target.value } })
                  }
                />

                {data.stickerTemplates.length ? (
                  <div className="mt-3">
                    <p className="label">バッジを贈る（任意）</p>
                    <div className="flex flex-wrap gap-2">
                      {data.stickerTemplates.map((template) => {
                        const active = entry.stickerId === template.id;
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() =>
                              setEntries({
                                ...entries,
                                [review.revieweeId]: { ...entry, stickerId: active ? null : template.id },
                              })
                            }
                            className={`rounded-lg border p-1.5 ${active ? 'border-brand-500 bg-brand-100' : 'border-ink-300'}`}
                          >
                            <img src={template.pictureUrl} alt={template.name} className="h-12 w-12 object-contain" />
                            <span className="block text-[10px]">{template.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}

          <div className="px-4 pt-4">
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? <Spinner /> : null}
              レビューを送る
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
