'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { l } from '@/lib';
import { api, query } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Badge, DataTable, Field, Loading, Modal, PageTitle, Pagination, Spinner } from '@/components/admin/ui';

interface ConversationRow {
  id: number;
  name: string;
  category: string;
  lastContent: string | null;
  lastSenderName: string | null;
  updatedAt: string | null;
  speakers: Array<{ userId: number; role: string; user: { id: number; nickName: string; userType: string } }>;
}

interface MessageRow {
  id: number;
  senderId: number;
  content: string;
  category: string;
  sentAt: string | null;
  createdAt: string;
  sender: { id: number; nickName: string; userType: string };
}

/** Conversations#index and Messages — chat moderation and operator replies. */
export function ConversationsPage(): ReactNode {
  const [filters, setFilters] = useState({ category: 'admin', userId: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading } = useAdminQuery<Paginated<ConversationRow>>(
    ['admin', 'conversations', filters, page],
    `/admin/conversations${query({ ...filters, page })}`,
  );

  return (
    <div>
      <PageTitle title="チャット" subtitle={`${data?.totalCount.toLocaleString() ?? 0} 件`} />

      <div className="card mb-4 grid gap-3 p-3 md:grid-cols-3">
        <Field label="種別">
          <select
            className="input"
            value={filters.category}
            onChange={(event) => {
              setFilters({ ...filters, category: event.target.value });
              setPage(1);
            }}
          >
            <option value="">すべて</option>
            <option value="admin">運営お問い合わせ</option>
            <option value="operator">支店サポート</option>
            <option value="private">個人チャット</option>
            <option value="meeting">オーダー</option>
            <option value="system">お知らせ</option>
          </select>
        </Field>
        <Field label="参加ユーザーID">
          <input
            className="input"
            value={filters.userId}
            onChange={(event) => {
              setFilters({ ...filters, userId: event.target.value });
              setPage(1);
            }}
          />
        </Field>
      </div>

      <div className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={data?.items ?? []}
              rowKey={(row) => row.id}
              empty="チャットルームがありません"
              columns={[
                { header: 'ID', cell: (row) => row.id },
                { header: '種別', cell: (row) => <Badge>{row.category}</Badge> },
                { header: '名称', cell: (row) => <span className="text-[12px]">{row.name}</span> },
                {
                  header: '参加者',
                  cell: (row) => (
                    <div className="text-[11px]">
                      {row.speakers.map((speaker) => (
                        <p key={speaker.userId}>
                          <Link href={`/users/${speaker.user.id}`}>{speaker.user.nickName}</Link>
                          <span className="ml-1 text-slate-400">{speaker.role}</span>
                        </p>
                      ))}
                    </div>
                  ),
                },
                {
                  header: '最新',
                  cell: (row) => (
                    <div className="max-w-xs text-[11px]">
                      <p className="truncate">
                        {row.lastSenderName ? `${row.lastSenderName}: ` : ''}
                        {row.lastContent ?? ''}
                      </p>
                      <p className="text-slate-400">{row.updatedAt ? l(row.updatedAt) : ''}</p>
                    </div>
                  ),
                },
                {
                  header: '',
                  cell: (row) => (
                    <button type="button" className="btn-secondary px-2 py-1" onClick={() => setOpenId(row.id)}>
                      開く
                    </button>
                  ),
                },
              ]}
            />
            <Pagination page={page} totalPages={data?.totalPages ?? 1} totalCount={data?.totalCount} onChange={setPage} />
          </>
        )}
      </div>

      {openId !== null ? <ThreadModal conversationId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function ThreadModal({ conversationId, onClose }: { conversationId: number; onClose: () => void }): ReactNode {
  const { run } = useAdminAction();
  const { data, isLoading, refetch } = useAdminQuery<Paginated<MessageRow>>(
    ['admin', 'conversation', conversationId, 'messages'],
    `/admin/conversations/${conversationId}/messages`,
  );
  const [draft, setDraft] = useState('');
  const [asSystem, setAsSystem] = useState(true);
  const [sending, setSending] = useState(false);

  async function send(): Promise<void> {
    if (!draft.trim()) return;
    setSending(true);
    // the internal API posts as the system user, or as a given sender
    await run(
      fetch('/internal_api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          content: draft,
          with_unread: true,
          with_broadcast: true,
          ...(asSystem ? {} : {}),
        }),
      }).then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<{ ok: boolean }>;
      }),
      { success: '送信しました' },
    );
    setDraft('');
    setSending(false);
    await refetch();
  }

  async function destroy(messageId: number): Promise<void> {
    if (!window.confirm('このメッセージを削除しますか？')) return;
    await run(api.delete(`/admin/messages/${messageId}`), { success: '削除しました' });
    await refetch();
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`チャットルーム ${conversationId}`}
      footer={
        <div className="space-y-2">
          <textarea
            className="input min-h-20"
            placeholder="運営局として送信する内容"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={asSystem} onChange={(event) => setAsSystem(event.target.checked)} />
              運営局（システム）として送信
            </label>
            <button type="button" className="btn-primary" onClick={() => void send()} disabled={sending || !draft.trim()}>
              {sending ? <Spinner /> : null}
              送信する
            </button>
          </div>
        </div>
      }
    >
      {isLoading ? (
        <Loading />
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {(data?.items ?? [])
            .slice()
            .reverse()
            .map((message) => (
              <li key={message.id} className="rounded border border-slate-200 p-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Link href={`/users/${message.sender.id}`}>{message.sender.nickName}</Link>
                  <Badge>{message.category}</Badge>
                  <span>{l(message.sentAt ?? message.createdAt)}</span>
                  <button type="button" className="ml-auto text-rose-600" onClick={() => void destroy(message.id)}>
                    削除
                  </button>
                </div>
                <div
                  className="mt-1 whitespace-pre-wrap break-words text-[12px]"
                  dangerouslySetInnerHTML={{ __html: message.content }}
                />
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}
