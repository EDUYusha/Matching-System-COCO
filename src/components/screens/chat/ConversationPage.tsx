'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ConversationDetail, MessageDto } from '@/lib';
import { config } from '@/lib';
import { formatDurationMinutes, l, lClock, numberToCredits } from '@/client/format';
import { api } from '@/client/api';
import { useAction, useApiQuery, useCableSubscription } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { sendMessageOverSocket } from '@/client/socket';
import { GiftIcon, ImageIcon, SendIcon } from '@/components/icons';
import { Avatar, Modal, PageHeader, PageLoading, RichText, Spinner } from '@/components/ui';

/**
 * ConversationsController#show — the chat thread, drawn as a LINE talk room:
 * the blue-grey wallpaper, the partner's white bubbles on the left under their
 * avatar, the viewer's green bubbles on the right with 既読 beside them, and a
 * round composer at the bottom.
 *
 * Besides the messages this hosts the controls the room type unlocks: the
 * arrive/finish buttons on an order room, the gift shelf and roulette, and the
 * order forms in a private room.
 */
export function ConversationPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { run } = useAction();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const { data, isLoading, refetch } = useApiQuery<ConversationDetail>(
    ['conversation', Number(id), page],
    `/conversations/${id}?page=${page}`,
  );

  // the cable tells us when a message lands in this room
  const onCable = useCallback(
    (payload: { action_type: string }) => {
      if (payload.action_type === 'message_received' || payload.action_type === 'messages_read') {
        void refetch();
      }
    },
    [refetch],
  );
  useCableSubscription(onCable);

  useEffect(() => {
    if (page === 1) bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [data?.messages.length, page]);

  // Grouped here rather than next to its use below: every hook has to run on
  // the loading render too, before the early returns.
  const grouped = useMemo(() => groupByDay(data?.messages ?? []), [data?.messages]);

  if (isLoading) return <PageLoading />;
  if (!data) return null;

  const { conversation, partner, meeting, myAttendance } = data;
  const title = partner?.nickName ?? conversation.name;
  // the gift shelf belongs to a private room, as the action row did before
  const canGift = conversation.category === 'private' && !!partner && data.stickers.length > 0;
  const showActions =
    conversation.category === 'private' &&
    !!partner &&
    (data.canOrder || data.canRequestOrder || data.roulettes.length > 0 || (canGift && data.disableNewMessages));

  async function send(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    setSending(true);
    try {
      // the socket is the normal path; the POST is the fallback the API also exposes
      sendMessageOverSocket(conversation.id, content);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await refetch();
    } finally {
      setSending(false);
    }
  }

  async function sendPicture(file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    setSending(true);
    try {
      await api.post(`/conversations/${conversation.id}/pictures`, body);
      await refetch();
    } finally {
      setSending(false);
    }
  }

  async function arrive(): Promise<void> {
    if (!meeting) return;
    if (!window.confirm('合流を開始しますか？ ゲストさんの前で確認のうえ押してください。')) return;
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/arrived`), {
      invalidate: [['conversation', Number(id)], ['meetings']],
    });
    await refetch();
  }

  async function finish(skipComplete: boolean): Promise<void> {
    if (!meeting) return;
    if (!window.confirm('解散しますか？ ゲストさんの前で確認のうえ押してください。')) return;
    await run(api.post<{ redirect: string }>(`/meetings/${meeting.id}/finish`, { skipComplete }), {
      invalidate: [['conversation', Number(id)], ['meetings'], ['me']],
    });
    await refetch();
  }

  async function sendGift(templateId: number): Promise<void> {
    await run(api.post<{ redirect: string }>(`/conversations/${conversation.id}/stickers/${templateId}`), {
      invalidate: [['conversation', Number(id)], ['me']],
    });
    setGiftOpen(false);
    await refetch();
  }

  const chip =
    'shrink-0 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-ink-800 shadow-sm transition hover:bg-white';

  return (
    <div className="flex min-h-dvh flex-col bg-chat-wall">
      <PageHeader
        title={title}
        subtitle={meeting ? `${meeting.statusLabel}・${meeting.areaName}` : undefined}
        back="/conversations"
        tone="chat"
        action={
          partner ? (
            <Link href={`/profiles/${partner.id}`} className="shrink-0 no-underline" aria-label="プロフィールを見る">
              <Avatar src={partner.profilePicUrl} alt={partner.nickName} size="sm" />
            </Link>
          ) : null
        }
      />

      {/* the order strip: status, times and the cast's arrive/finish controls */}
      {meeting ? (
        <div className="mx-3 mt-1 rounded-2xl bg-white/95 px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink-800">
                {l(meeting.plannedStartTime)} 〜 {formatDurationMinutes(meeting.plannedLengthMinutes)}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {meeting.areaName} · キャスト{meeting.neededPersonCount}名 ·{' '}
                {meeting.finalCosts !== null
                  ? numberToCredits(meeting.finalCosts)
                  : numberToCredits(meeting.estimatedCostsWithNightSurcharge)}
              </p>
            </div>
            {['finished', 'completed'].includes(meeting.status) ? (
              <Link
                href={`/meetings/${meeting.id}/review`}
                className="btn-secondary shrink-0 rounded-full px-3 py-1.5 text-xs no-underline"
              >
                レビュー
              </Link>
            ) : null}
          </div>

          {myAttendance && user?.permissions.cast ? (
            <div className="mt-2.5 flex gap-2">
              {!myAttendance.startTime ? (
                <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={() => void arrive()}>
                  合流開始
                </button>
              ) : !myAttendance.endTime ? (
                <>
                  <button type="button" className="btn-primary flex-1 py-2 text-xs" onClick={() => void finish(false)}>
                    解散する
                  </button>
                  <button
                    type="button"
                    className="btn-secondary shrink-0 px-3 py-2 text-xs"
                    onClick={() => void finish(true)}
                    title="時間の修正が必要な場合は決済を保留します"
                  >
                    時間変更あり
                  </button>
                </>
              ) : (
                <p className="flex-1 text-center text-[11px] text-ink-500">解散済みです</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* the private-room actions: order, request and roulette */}
      {showActions ? (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1 pt-2">
          {data.canOrder ? (
            <button type="button" className={chip} onClick={() => setOrderOpen(true)}>
              個TOLAを依頼
            </button>
          ) : null}
          {data.canRequestOrder ? (
            <button type="button" className={chip} onClick={() => setOrderOpen(true)}>
              オーダーを提案
            </button>
          ) : null}
          {/* with the composer closed, the gift shelf has no other way in */}
          {canGift && data.disableNewMessages ? (
            <button type="button" className={chip} onClick={() => setGiftOpen(true)}>
              ギフトを贈る
            </button>
          ) : null}
          {data.roulettes.map((roulette) => (
            <button
              key={roulette.id}
              type="button"
              className={chip}
              onClick={() => router.push(`/conversations/${conversation.id}/stickers/roulette/${roulette.id}`)}
            >
              {roulette.name}（{numberToCredits(roulette.fee)}）
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 px-3 pb-4 pt-1">
        {data.overflowMessageId ? (
          <button
            type="button"
            className="mx-auto mt-2 block rounded-full bg-black/20 px-4 py-1 text-[11px] font-bold text-white hover:bg-black/30"
            onClick={() => setPage(page + 1)}
          >
            過去のメッセージを読む
          </button>
        ) : null}

        {grouped.map(([day, dayMessages]) => (
          <section key={day}>
            <p className="mx-auto mb-1 mt-4 w-fit rounded-full bg-black/20 px-3 py-0.5 text-[11px] font-medium text-white">
              {day}
            </p>
            {dayMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                startsRun={startsRun(dayMessages[index - 1], message)}
              />
            ))}
          </section>
        ))}
        <div ref={bottomRef} />
      </div>

      {!data.disableNewMessages ? (
        <form
          onSubmit={send}
          className="sticky bottom-0 flex items-end gap-0.5 border-t border-ink-200 bg-white px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2"
        >
          <label
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-600 hover:bg-ink-100"
            title="画像を送る"
          >
            <ImageIcon className="h-6 w-6" />
            <span className="sr-only">画像を送る</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void sendPicture(file);
                event.target.value = '';
              }}
            />
          </label>
          {canGift ? (
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100"
              onClick={() => setGiftOpen(true)}
              title="ギフトを贈る"
              aria-label="ギフトを贈る"
            >
              <GiftIcon className="h-6 w-6" />
            </button>
          ) : null}
          <textarea
            className="field-sizing-content mx-1 max-h-32 min-h-10 flex-1 resize-none rounded-[20px] bg-ink-100 px-4 py-2 text-[15px] leading-6 text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            rows={1}
            placeholder="メッセージを送る"
            aria-label="メッセージ"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send(event);
              }
            }}
          />
          <button
            type="submit"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-600 transition hover:bg-brand-50 disabled:text-ink-300 disabled:hover:bg-transparent"
            disabled={sending || !draft.trim()}
            aria-label="送信"
          >
            {sending ? <Spinner /> : <SendIcon className="h-6 w-6" strokeWidth={2} />}
          </button>
        </form>
      ) : (
        <p className="border-t border-ink-200 bg-white px-4 py-3 text-center text-[12px] text-ink-500">
          このチャットルームには返信できません
        </p>
      )}

      <Modal open={giftOpen} onClose={() => setGiftOpen(false)} title="ギフトを贈る">
        <div className="grid grid-cols-3 gap-2">
          {data.stickers.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => void sendGift(template.id)}
              className="rounded-xl p-2 text-center transition hover:bg-ink-50 active:bg-ink-100 disabled:opacity-40"
              disabled={!!template.eventCampaign && template.eventCampaign.remainingToday <= 0}
            >
              <img src={template.pictureUrl} alt={template.name} className="mx-auto h-16 w-16 object-contain" />
              <span className="mt-1 block truncate text-[11px] text-ink-800">{template.name}</span>
              <span className="block text-[11px] font-bold text-brand-700">
                {template.free ? '無料' : numberToCredits(template.price)}
              </span>
              {template.eventCampaign ? (
                <span className="block text-[10px] text-ink-500">
                  本日あと{template.eventCampaign.remainingToday}回
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {user?.permissions.customer ? (
          <p className="mt-3 text-[11px] text-ink-500">
            ポイントが不足する場合はご登録のカードから自動チャージされます。
          </p>
        ) : null}
      </Modal>

      <OrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        conversationId={conversation.id}
        mode={data.canRequestOrder ? 'request' : 'order'}
        partnerFee={partner?.orderFeePerTime ?? user?.orderFeePerTime ?? null}
        onCreated={() => {
          setOrderOpen(false);
          void queryClient.invalidateQueries();
          void refetch();
        }}
      />
    </div>
  );
}

/** Notices are centred across the room rather than drawn as a speaker's bubble. */
function isNotice(message: MessageDto): boolean {
  return message.ignored || message.isSystem || message.category === 'service';
}

/**
 * Consecutive messages from one speaker form a run: only its first shows the
 * avatar, the name and the bubble tail, and runs are spaced further apart.
 */
function startsRun(previous: MessageDto | undefined, message: MessageDto): boolean {
  if (!previous || isNotice(previous) || isNotice(message)) return true;
  return previous.senderId !== message.senderId;
}

function MessageBubble({ message, startsRun: first }: { message: MessageDto; startsRun: boolean }): ReactNode {
  const spacing = first ? 'mt-3' : 'mt-1';

  if (message.ignored) {
    return (
      <p className={clsx(spacing, 'mx-auto w-fit rounded-full bg-black/15 px-3 py-0.5 text-[11px] text-white')}>
        ブロック中のユーザーのメッセージ
      </p>
    );
  }

  if (isNotice(message)) {
    return (
      <div className={clsx(spacing, 'mx-auto max-w-[88%] rounded-2xl bg-white/95 px-4 py-3 shadow-sm')}>
        {message.title ? <p className="mb-1 text-xs font-bold text-brand-700">{message.title}</p> : null}
        <RichText html={message.content} className="text-[12px] leading-relaxed text-ink-800" />
        <p className="mt-1 text-right text-[10px] text-ink-500">{lClock(message.sentAt)}</p>
      </div>
    );
  }

  const mine = message.isMine;
  const surface = mine ? 'bg-bubble-mine' : 'bg-bubble-theirs';
  const tail = first ? (mine ? 'bubble-tail-mine' : 'bubble-tail-theirs') : null;

  // a photo stands on its own, without a bubble, as in LINE; the minimum size
  // and tint keep a photo whose upload has gone missing visible as a tile
  const body =
    message.category === 'picture' ? (
      <img
        src={message.content}
        alt="写真"
        className="block min-h-24 min-w-24 max-h-72 max-w-full rounded-2xl bg-white/40 object-cover text-[0px]"
      />
    ) : message.category === 'sticker' || message.category === 'internal' ? (
      <RichText html={message.content} className={clsx('bubble', surface, tail)} />
    ) : (
      <RichText html={message.content} className={clsx('bubble whitespace-pre-wrap', surface, tail)} />
    );

  const meta = (
    <span
      className={clsx(
        'flex shrink-0 flex-col pb-0.5 text-[10px] leading-tight text-ink-900/70',
        mine ? 'items-end' : 'items-start',
      )}
    >
      {/* LINE marks only a read message; an unread one shows just the time */}
      {mine && message.partnerUnreadCount === 0 ? <span>既読</span> : null}
      <span>{lClock(message.sentAt)}</span>
    </span>
  );

  if (mine) {
    return (
      <div className={clsx(spacing, 'flex items-end justify-end gap-1.5 pl-12 pr-1.5')}>
        {meta}
        <div className="flex min-w-0 justify-end">{body}</div>
      </div>
    );
  }

  return (
    <div className={clsx(spacing, 'flex items-start gap-2 pr-10')}>
      {first ? (
        <Avatar src={message.senderProfilePicUrl} alt={message.senderName} size="sm" />
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {first ? <p className="mb-1 truncate text-[11px] text-ink-900/80">{message.senderName}</p> : null}
        <div className="flex items-end gap-1.5">
          <div className="min-w-0">{body}</div>
          {meta}
        </div>
      </div>
    </div>
  );
}

function groupByDay(messages: MessageDto[]): Array<[string, MessageDto[]]> {
  const groups = new Map<string, MessageDto[]>();
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  });
  for (const message of messages) {
    const day = formatter.format(new Date(message.sentAt));
    groups.set(day, [...(groups.get(day) ?? []), message]);
  }
  return [...groups.entries()];
}

/**
 * The individual-order form. A guest books the cast (IndividualOrderForm); a cast
 * proposes an order to the guest at their own rate (OrderRequestForm).
 */
function OrderModal({
  open,
  onClose,
  conversationId,
  mode,
  partnerFee,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: number;
  mode: 'order' | 'request';
  partnerFee: number | null;
  onCreated: () => void;
}): ReactNode {
  const { run } = useAction();
  const [areas, setAreas] = useState<Array<{ id: number; name: string; custom: boolean }>>([]);
  const [form, setForm] = useState({
    startTime: '',
    timeSpan: '120',
    areaId: '',
    areaName: '',
    baseCostPerTime: partnerFee ? String(partnerFee) : '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ areas: Array<{ id: number; name: string; businessAreaId: number; custom: boolean }> }>('/meetings/new')
      .then((data) => {
        setAreas(data.areas);
        setForm((current) => ({ ...current, areaId: current.areaId || String(data.areas[0]?.id ?? '') }));
      })
      .catch(() => undefined);
  }, [open]);

  const selectedArea = areas.find((area) => String(area.id) === form.areaId);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    const payload = {
      conversationId,
      startTime: new Date(form.startTime).toISOString(),
      timeSpan: Number(form.timeSpan),
      areaId: Number(form.areaId),
      areaName: selectedArea?.custom ? form.areaName : (selectedArea?.name ?? ''),
      ...(mode === 'request' ? { baseCostPerTime: Number(form.baseCostPerTime) } : {}),
    };
    const result = await run(
      api.post<{ meetingId: number; flash: { type: string; message: string } }>(
        mode === 'request' ? '/meetings/request_individual' : '/meetings/individual',
        payload,
      ),
    );
    setSubmitting(false);
    if (result) onCreated();
  }

  const estimate =
    (Number(form.baseCostPerTime || partnerFee || 0) *
      Math.floor(Number(form.timeSpan || 0) / config.cost_time_interval)) ||
    0;

  return (
    <Modal open={open} onClose={onClose} title={mode === 'request' ? 'オーダーを提案する' : '個TOLAを依頼する'}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">開始日時</span>
          <input
            type="datetime-local"
            className="input"
            value={form.startTime}
            onChange={(event) => setForm({ ...form, startTime: event.target.value })}
            required
          />
        </label>

        <label className="block">
          <span className="label">実施時間</span>
          <select
            className="input"
            value={form.timeSpan}
            onChange={(event) => setForm({ ...form, timeSpan: event.target.value })}
          >
            {[60, 90, 120, 150, 180, 240].map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatDurationMinutes(minutes)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">エリア</span>
          <select
            className="input"
            value={form.areaId}
            onChange={(event) => setForm({ ...form, areaId: event.target.value })}
            required
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>

        {selectedArea?.custom ? (
          <label className="block">
            <span className="label">待ち合わせ場所</span>
            <input
              className="input"
              value={form.areaName}
              onChange={(event) => setForm({ ...form, areaName: event.target.value })}
              required
            />
          </label>
        ) : null}

        {mode === 'request' ? (
          <label className="block">
            <span className="label">料金（30分あたり）</span>
            <input
              type="number"
              min={0}
              step={100}
              className="input"
              value={form.baseCostPerTime}
              onChange={(event) => setForm({ ...form, baseCostPerTime: event.target.value })}
              required
            />
            <span className="mt-1 block text-[11px] text-ink-500">
              ご自身のレベルで設定可能な範囲内で入力してください
            </span>
          </label>
        ) : null}

        <p className="text-[11px] text-ink-500">
          概算料金 <span className="font-bold text-brand-700">{numberToCredits(estimate)}</span>
          <br />
          延長は1.3倍のポイント消費になります。個TOLAに深夜手当はありません。
        </p>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {mode === 'request' ? '提案する' : '依頼する'}
        </button>
      </form>
    </Modal>
  );
}
