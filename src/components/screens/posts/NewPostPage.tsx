'use client';

import { useRef, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { PageHeader, Spinner } from '@/components/ui';

/** PostsController#new / #create. */
export function NewPostPage(): ReactNode {
  const user = useCurrentUser();
  const { run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'public' | 'cast_only'>('public');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    const body = new FormData();
    body.append('content', content);
    body.append('category', category);
    for (const file of files) body.append('pictures', file);

    await run(api.post<{ redirect: string }>('/posts', body), { invalidate: [['posts']] });
    setSubmitting(false);
  }

  return (
    <div>
      <PageHeader title="つぶやきを投稿" back="/posts" />
      <form onSubmit={submit} className="space-y-4 px-4 py-4">
        <textarea
          className="input min-h-40"
          placeholder="いまの気持ちをつぶやいてみましょう"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />

        {files.length ? (
          <div className="grid grid-cols-3 gap-2">
            {files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="relative">
                <img src={URL.createObjectURL(file)} alt="" className="aspect-square w-full rounded object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, candidate) => candidate !== index))}
                  className="absolute right-1 top-1 rounded bg-paper-100/85 px-1.5 text-xs text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <button type="button" className="btn-secondary w-full" onClick={() => fileInput.current?.click()}>
          写真を追加
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            setFiles([...files, ...Array.from(event.target.files ?? [])].slice(0, 4));
            event.target.value = '';
          }}
        />

        {user?.permissions.cast ? (
          <label className="block">
            <span className="label">公開範囲</span>
            <select
              className="input"
              value={category}
              onChange={(event) => setCategory(event.target.value as 'public' | 'cast_only')}
            >
              <option value="public">全体に公開</option>
              <option value="cast_only">キャストのみ</option>
            </select>
          </label>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={submitting || (!content.trim() && !files.length)}>
          {submitting ? <Spinner /> : null}
          投稿する
        </button>
      </form>
    </div>
  );
}
