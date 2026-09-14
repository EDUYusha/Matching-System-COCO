'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { AttributeGroup } from '@/lib';
import { api } from '@/client/api';
import { useAction, useApiQuery } from '@/client/hooks';
import { PageHeader, PageLoading, Spinner } from '@/components/ui';

/**
 * ProfilesController#edit_attributes / #update_attributes.
 *
 * The form is generated from attributes_schema, so the fields follow whatever the
 * admin has configured. Date entries submit {year, month, day} because that is
 * what User#update_attribute_entries expects, including its 1960-01-01 sentinel
 * for "not filled in".
 */
export function EditAttributesPage(): ReactNode {
  const { run } = useAction();
  const { data, isLoading } = useApiQuery<{ attributeGroups: AttributeGroup[] }>(
    ['profile', 'edit_attributes'],
    '/profile/edit_attributes',
  );

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, unknown> = {};
    for (const group of data.attributeGroups) {
      for (const entry of group.entries) {
        if (entry.valueType === 'Date' && entry.value) {
          const [year, month, day] = entry.value.split('-').map(Number);
          initial[entry.name] = { year, month, day };
        } else {
          initial[entry.name] = entry.value ?? '';
        }
      }
    }
    setValues(initial);
  }, [data]);

  if (isLoading) return <PageLoading />;

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    await run(
      api.post<{ redirect: string; flash: { type: string; message: string } }>('/profile/attributes', {
        entries: values,
      }),
      { invalidate: [['profile']] },
    );
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="プロフィール詳細編集" back="/profile/settings" />
      <form onSubmit={save} className="pb-8">
        {data?.attributeGroups.map((group) => (
          <section key={group.category}>
            <h2 className="section-title">{group.category}</h2>
            <div className="space-y-4 px-4">
              {group.entries.map((entry) => (
                <label key={entry.id} className="block">
                  <span className="label">
                    {entry.name}
                    {entry.comment && entry.comment !== 'Special Value' ? (
                      <span className="ml-1 text-ink-500">({entry.comment})</span>
                    ) : null}
                  </span>

                  {entry.valueList?.length ? (
                    <select
                      className="input"
                      value={String(values[entry.name] ?? '')}
                      onChange={(event) => setValues({ ...values, [entry.name]: event.target.value })}
                    >
                      <option value="">未設定</option>
                      {entry.valueList.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : entry.valueType === 'Text' ? (
                    <textarea
                      className="input min-h-32"
                      value={String(values[entry.name] ?? '')}
                      onChange={(event) => setValues({ ...values, [entry.name]: event.target.value })}
                    />
                  ) : entry.valueType === 'Integer' ? (
                    <input
                      type="number"
                      className="input"
                      value={String(values[entry.name] ?? '')}
                      onChange={(event) => setValues({ ...values, [entry.name]: event.target.value })}
                    />
                  ) : entry.valueType === 'Date' ? (
                    <DateFields
                      value={values[entry.name] as { year?: number; month?: number; day?: number } | undefined}
                      onChange={(next) => setValues({ ...values, [entry.name]: next })}
                    />
                  ) : (
                    <input
                      className="input"
                      value={String(values[entry.name] ?? '')}
                      onChange={(event) => setValues({ ...values, [entry.name]: event.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}

        <div className="px-4 pt-6">
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? <Spinner /> : null}
            更新する
          </button>
        </div>
      </form>
    </div>
  );
}

function DateFields({
  value,
  onChange,
}: {
  value: { year?: number; month?: number; day?: number } | undefined;
  onChange: (value: { year: number; month: number; day: number }) => void;
}): ReactNode {
  // 1960-01-01 is the schema's "not set" sentinel, so it is also the placeholder
  const year = value?.year ?? 1960;
  const month = value?.month ?? 1;
  const day = value?.day ?? 1;

  return (
    <div className="grid grid-cols-3 gap-2">
      <input
        type="number"
        className="input"
        placeholder="年"
        value={year}
        onChange={(event) => onChange({ year: Number(event.target.value), month, day })}
      />
      <input
        type="number"
        min={1}
        max={12}
        className="input"
        placeholder="月"
        value={month}
        onChange={(event) => onChange({ year, month: Number(event.target.value), day })}
      />
      <input
        type="number"
        min={1}
        max={31}
        className="input"
        placeholder="日"
        value={day}
        onChange={(event) => onChange({ year, month, day: Number(event.target.value) })}
      />
    </div>
  );
}
