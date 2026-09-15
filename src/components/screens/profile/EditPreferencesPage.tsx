'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

interface PreferenceGroups {
  preferenceGroups: Record<
    string,
    Array<{ id: number; name: string | null; subcategory: string | null; selected: boolean }>
  >;
}

/**
 * ProfilesController#edit_meeting_preferences / #update_meeting_preferences.
 *
 * Cast only. These are what AutoSelectCast scores a cast against the guest's
 * wishes, so each one is worth points in the matching.
 */
export function EditPreferencesPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<PreferenceGroups>(
    ['profile', 'edit_meeting_preferences'],
    '/profile/edit_meeting_preferences',
  );

  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const ids = Object.values(data.preferenceGroups)
      .flat()
      .filter((preference) => preference.selected)
      .map((preference) => preference.id);
    setSelected(ids);
  }, [data]);

  if (isLoading) return <PageLoading />;

  function toggle(id: number, subcategory: string | null, exclusiveIds: number[]): void {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id);
      // a mutually-exclusive group allows only one pick, which the API also enforces
      const withoutGroup = subcategory ? current.filter((candidate) => !exclusiveIds.includes(candidate)) : current;
      return [...withoutGroup, id];
    });
  }

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/profile/meeting_preferences', {
        preferenceIds: selected,
      }),
      { invalidate: [['profile']] },
    );
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="マッチング項目設定" back="/profile/settings" />
      <p className="px-4 pt-3 text-[11px] leading-relaxed text-ink-500">
        該当する項目を選択してください。ゲストの希望と一致するほどオーダーのマッチング率が上がります。
      </p>

      <form onSubmit={save} className="pb-8">
        {Object.entries(data?.preferenceGroups ?? {}).map(([category, preferences]) => {
          const bySubcategory = new Map<string, typeof preferences>();
          for (const preference of preferences) {
            const key = preference.subcategory ?? '';
            bySubcategory.set(key, [...(bySubcategory.get(key) ?? []), preference]);
          }

          return (
            <section key={category}>
              <h2 className="section-title">{category}</h2>
              {[...bySubcategory.entries()].map(([subcategory, group]) => (
                <div key={subcategory || 'default'} className="px-4 pb-3">
                  {subcategory ? <p className="mb-1.5 text-[11px] text-ink-500">{subcategory}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {group.map((preference) => {
                      const active = selected.includes(preference.id);
                      return (
                        <button
                          key={preference.id}
                          type="button"
                          onClick={() =>
                            toggle(
                              preference.id,
                              preference.subcategory,
                              group.map((candidate) => candidate.id),
                            )
                          }
                          className={`badge px-3 py-1.5 ${
                            active ? 'bg-gold-500 text-ink-900' : 'border border-ink-300 bg-white text-ink-700'
                          }`}
                        >
                          {preference.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          );
        })}

        <div className="px-4 pt-4">
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? <Spinner /> : null}
            更新する
          </button>
        </div>
      </form>
    </div>
  );
}
