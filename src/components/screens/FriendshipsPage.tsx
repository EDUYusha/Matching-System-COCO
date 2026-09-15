'use client';

import { useState, type ReactNode } from 'react';
import type { UserCard } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { EmptyState, Field, Modal, PageHeader, PageLoading, Spinner } from '@/components/ui';
import { UserCardRow } from '@/components/UserCardRow';

interface Response {
  friendships: Array<{ id: number; mutual: boolean; status: string; friend: UserCard }>;
  requests: Array<{ id: number; mutual: boolean; status: string; user: UserCard }>;
}

/**
 * FriendshipsController. Mutual friendships are what let cast enter a group order
 * together as a team.
 */
export function FriendshipsPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading, refetch } = useApiQuery<Response>(['friendships'], '/friendships');
  const [addOpen, setAddOpen] = useState(false);
  const [inviterCode, setInviterCode] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoading />;

  async function act(path: string): Promise<void> {
    await run(api.post<{ flash: { type: string; message: string } }>(path));
    await refetch();
  }

  async function request(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    const result = await run(
      api.post<{ flash: { type: string; message: string } }>('/friendships', { inviterCode, contactMessage }),
    );
    setSubmitting(false);
    if (result) {
      setAddOpen(false);
      setInviterCode('');
      setContactMessage('');
      await refetch();
    }
  }

  return (
    <div>
      <PageHeader
        title="お友達"
        back="/user/settings"
        action={
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setAddOpen(true)}>
            申請する
          </button>
        }
      />

      {data?.requests.length ? (
        <section>
          <h2 className="section-title">届いている申請</h2>
          <ul>
            {data.requests.map((request) => (
              <UserCardRow
                key={request.id}
                user={request.user}
                right={
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      className="btn-primary px-2.5 py-1.5 text-xs"
                      onClick={() => void act(`/friendships/${request.id}/accept`)}
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-2.5 py-1.5 text-xs"
                      onClick={() => void act(`/friendships/${request.id}/refuse`)}
                    >
                      断る
                    </button>
                  </div>
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      <h2 className="section-title">お友達</h2>
      {data?.friendships.length ? (
        <ul>
          {data.friendships.map((friendship) => (
            <UserCardRow
              key={friendship.id}
              user={friendship.friend}
              right={
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`badge ${friendship.mutual ? 'bg-emerald-500/20 text-emerald-600' : 'bg-ink-200 text-ink-700'}`}>
                    {friendship.mutual ? '相互' : '申請中'}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => void act(`/friendships/${friendship.id}/cancel`)}
                  >
                    解除
                  </button>
                </div>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState title="お友達がいません" hint="紹介者コードで申請できます" />
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="友達申請">
        <form onSubmit={request} className="space-y-3">
          <Field label="相手の紹介者コード">
            <input className="input" value={inviterCode} onChange={(event) => setInviterCode(event.target.value)} required />
          </Field>
          <Field label="メッセージ（任意）">
            <textarea
              className="input min-h-24"
              value={contactMessage}
              onChange={(event) => setContactMessage(event.target.value)}
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            申請する
          </button>
        </form>
      </Modal>
    </div>
  );
}
