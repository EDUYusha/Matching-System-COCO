'use client';

import { useState, type ReactNode } from 'react';
import { api } from '@/client/admin-api';
import { useAdminAction, useAdminQuery } from '@/client/admin-hooks';
import { Field, PageTitle, Spinner } from '@/components/admin/ui';

interface Options {
  businessAreas: Array<{ id: number; name: string }>;
  castLevels: Array<{ id: number; name: string }>;
  userTypes: string[];
}

/**
 * CastMessageMultipleDeliveries — one announcement to many members at once.
 *
 * It posts into each recipient's announcements room, which also triggers their
 * LINE and push notification unless they have turned messages off.
 */
export function BroadcastPage(): ReactNode {
  const { run } = useAdminAction();
  const { data: options } = useAdminQuery<Options>(['admin', 'options'], '/admin/options');

  const [mode, setMode] = useState<'filter' | 'ids'>('filter');
  const [form, setForm] = useState({
    content: '',
    userType: 'cast',
    businessAreaId: '',
    castLevelId: '',
    userIds: '',
    withBroadcast: true,
  });
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  async function send(): Promise<void> {
    const recipients =
      mode === 'ids'
        ? form.userIds
            .split(/[\s,]+/)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
        : undefined;

    if (mode === 'ids' && (!recipients || !recipients.length)) {
      window.alert('送信先のユーザーIDを入力してください。');
      return;
    }
    if (!window.confirm('この内容で一斉送信しますか？ 取り消せません。')) return;

    setSending(true);
    const result = await run(
      api.post<{ sent: number }>('/admin/broadcast', {
        content: form.content,
        withBroadcast: form.withBroadcast,
        ...(mode === 'ids'
          ? { userIds: recipients }
          : {
              userType: form.userType || undefined,
              businessAreaId: form.businessAreaId ? Number(form.businessAreaId) : undefined,
              castLevelId: form.castLevelId ? Number(form.castLevelId) : undefined,
            }),
      }),
      { success: '送信しました' },
    );
    setSending(false);
    if (result) {
      setSentCount(result.sent);
      setForm({ ...form, content: '' });
    }
  }

  return (
    <div>
      <PageTitle title="一斉送信" subtitle="運営局からのメッセージを複数のメンバーに送ります" />

      <div className="card max-w-2xl p-4">
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={mode === 'filter' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
            onClick={() => setMode('filter')}
          >
            条件で指定
          </button>
          <button
            type="button"
            className={mode === 'ids' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
            onClick={() => setMode('ids')}
          >
            IDで指定
          </button>
        </div>

        {mode === 'filter' ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="種別">
              <select className="input" value={form.userType} onChange={(event) => setForm({ ...form, userType: event.target.value })}>
                <option value="">すべて</option>
                {options?.userTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="支店">
              <select
                className="input"
                value={form.businessAreaId}
                onChange={(event) => setForm({ ...form, businessAreaId: event.target.value })}
              >
                <option value="">すべて</option>
                {options?.businessAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="キャストレベル">
              <select
                className="input"
                value={form.castLevelId}
                onChange={(event) => setForm({ ...form, castLevelId: event.target.value })}
              >
                <option value="">すべて</option>
                {options?.castLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <Field label="送信先ユーザーID" hint="カンマ・空白・改行で区切ってください">
            <textarea
              className="input min-h-20"
              value={form.userIds}
              onChange={(event) => setForm({ ...form, userIds: event.target.value })}
            />
          </Field>
        )}

        <div className="mt-3">
          <Field label="本文" hint="HTMLのリンクや強調も使用できます">
            <textarea
              className="input min-h-40"
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
            />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.withBroadcast}
            onChange={(event) => setForm({ ...form, withBroadcast: event.target.checked })}
          />
          LINE・プッシュ通知も送信する
        </label>

        <button
          type="button"
          className="btn-primary mt-4 w-full"
          onClick={() => void send()}
          disabled={sending || !form.content.trim()}
        >
          {sending ? <Spinner /> : null}
          一斉送信する
        </button>

        {sentCount !== null ? (
          <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-[12px] text-emerald-800">
            {sentCount.toLocaleString()} 名に送信しました。
          </p>
        ) : null}
      </div>
    </div>
  );
}
