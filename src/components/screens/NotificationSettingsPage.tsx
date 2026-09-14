'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * UsersController#edit_notification_settings / #update_notification_settings.
 *
 * Turning `no_ranking` on also journals the change, because the monthly rankings
 * judge visibility as of their deadline rather than as of now.
 */
export function NotificationSettingsPage(): ReactNode {
  const user = useCurrentUser();
  const { run } = useAction();
  const [form, setForm] = useState({
    messageNotification: true,
    footprintNotification: true,
    noRanking: false,
    noFame: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.settings) return;
    setForm({
      messageNotification: user.settings.messageNotification,
      footprintNotification: user.settings.footprintNotification,
      noRanking: user.settings.noRanking,
      noFame: user.settings.noFame,
    });
  }, [user]);

  if (!user) return <PageLoading />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/user/notification_settings', form),
      { invalidate: [['me'], ['user', 'settings']] },
    );
    setSubmitting(false);
  }

  const toggles: Array<[keyof typeof form, string, string]> = [
    ['messageNotification', 'メッセージ通知', 'チャットの新着をLINE・プッシュでお知らせします'],
    ['footprintNotification', '足あと通知', 'プロフィールを見られたときにお知らせします'],
    ['noRanking', 'ランキングに表示しない', '非表示にすると順位・名前が公開されなくなります'],
    ['noFame', 'ギフト送信者を匿名にする', 'つぶやきのギフト表示で名前と写真を隠します'],
  ];

  return (
    <div>
      <PageHeader title="通知・公開設定" back="/user/settings" />
      <form onSubmit={submit}>
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {toggles.map(([key, label, hint]) => (
            <li key={key} className="flex items-start gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{label}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form[key]}
                onClick={() => setForm({ ...form, [key]: !form[key] })}
                className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${form[key] ? 'bg-gold-500' : 'bg-ink-200'}`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition ${form[key] ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </button>
            </li>
          ))}
        </ul>

        {user.settings?.noRankingSetAt ? (
          <p className="px-4 py-3 text-[11px] text-ink-500">
            ランキング非表示の初回設定日：{new Date(user.settings.noRankingSetAt).toLocaleDateString('ja-JP')}
          </p>
        ) : null}

        <div className="px-4 py-5">
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            更新する
          </button>
        </div>
      </form>
    </div>
  );
}
