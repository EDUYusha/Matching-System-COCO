'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PictureDto } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { useAppStore, useCurrentUser } from '@/client/store';
import { Field, PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * ProfilesController#edit_basics / #update_basics, plus PicturesController.
 *
 * The order fee only appears for cast, and the API re-checks it against the cast
 * level's min/max (User#fee_limits) so a stale form cannot bypass the limit.
 */
export function EditBasicsPage(): ReactNode {
  const user = useCurrentUser();
  const pushToast = useAppStore((state) => state.pushToast);
  const { run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useApiQuery<{ pictures: PictureDto[] }>(
    ['profile', 'edit_basics'],
    '/profile/edit_basics',
  );

  const [form, setForm] = useState({
    nickName: '',
    motto: '',
    age: '',
    birthdayPublished: '1',
    orderFeePerTime: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      nickName: user.nickName,
      motto: user.motto ?? '',
      age: user.age === null ? '' : String(user.age),
      birthdayPublished: String(user.birthdayPublished ?? 1),
      orderFeePerTime: user.orderFeePerTime === null ? '' : String(user.orderFeePerTime),
    });
  }, [user]);

  if (isLoading) return <PageLoading />;

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await run(
        api.post<{ redirect: string; flash: { type: 'notice'; message: string } }>('/profile/basics', {
          nickName: form.nickName,
          motto: form.motto,
          age: form.age ? Number(form.age) : null,
          birthdayPublished: Number(form.birthdayPublished),
          ...(user?.permissions.cast
            ? { orderFeePerTime: form.orderFeePerTime ? Number(form.orderFeePerTime) : null }
            : {}),
        }),
        { invalidate: [['me'], ['profile']] },
      );
    } catch (error) {
      if (error instanceof ApiRequestError) setErrors(error.details ?? {});
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File): Promise<void> {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await api.post('/pictures', body);
      await refetch();
      pushToast({ type: 'notice', message: '写真を追加しました。' });
    } catch (error) {
      pushToast({ type: 'alert', message: (error as Error).message });
    } finally {
      setUploading(false);
    }
  }

  async function setProfilePicture(id: number): Promise<void> {
    await api.put(`/pictures/${id}/set_profile`);
    await refetch();
  }

  async function destroy(id: number): Promise<void> {
    if (!window.confirm('この写真を削除しますか？')) return;
    await api.delete(`/pictures/${id}`);
    await refetch();
  }

  return (
    <div>
      <PageHeader title="基本情報・写真" back="/profile/settings" />

      <section className="px-4 py-4">
        <h2 className="label">写真</h2>
        <div className="grid grid-cols-3 gap-2">
          {data?.pictures.map((picture) => (
            <div key={picture.id} className="relative">
              <img src={picture.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              {picture.profilePic ? (
                <span className="absolute left-1 top-1 badge bg-brand-500 text-white">メイン</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void setProfilePicture(picture.id)}
                  className="absolute left-1 top-1 badge bg-paper-100/85 text-ink-900"
                >
                  メインに
                </button>
              )}
              <button
                type="button"
                onClick={() => void destroy(picture.id)}
                className="absolute right-1 top-1 rounded bg-paper-100/85 px-1.5 text-xs text-red-600"
                aria-label="削除"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-ink-300 text-2xl text-ink-500"
            disabled={uploading}
          >
            {uploading ? <Spinner /> : '+'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </section>

      <form onSubmit={save} className="space-y-4 px-4 pb-8">
        <Field label="ニックネーム" error={errors.nick_name}>
          <input
            className="input"
            value={form.nickName}
            onChange={(event) => setForm({ ...form, nickName: event.target.value })}
            required
          />
        </Field>

        <Field label="ひとこと" error={errors.motto}>
          <textarea
            className="input min-h-28"
            value={form.motto}
            onChange={(event) => setForm({ ...form, motto: event.target.value })}
          />
        </Field>

        <Field label="年齢" error={errors.age ?? errors.birthday}>
          <input
            type="number"
            min={18}
            max={100}
            className="input"
            value={form.age}
            onChange={(event) => setForm({ ...form, age: event.target.value })}
          />
        </Field>

        <Field label="年齢の公開">
          <select
            className="input"
            value={form.birthdayPublished}
            onChange={(event) => setForm({ ...form, birthdayPublished: event.target.value })}
          >
            <option value="1">公開する</option>
            <option value="0">公開しない</option>
          </select>
        </Field>

        {user?.permissions.cast ? (
          <Field
            label="個TOLA料金（30分あたり）"
            error={errors.order_fee_per_time}
            hint={
              user.castLevel
                ? `${user.castLevel.name}の設定可能範囲内で入力してください`
                : '0にすると個TOLAの受付を停止します'
            }
          >
            <input
              type="number"
              min={0}
              step={100}
              className="input"
              value={form.orderFeePerTime}
              onChange={(event) => setForm({ ...form, orderFeePerTime: event.target.value })}
            />
          </Field>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner /> : null}
          更新する
        </button>
      </form>
    </div>
  );
}
