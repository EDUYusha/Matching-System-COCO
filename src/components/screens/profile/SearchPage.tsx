'use client';

import Link from 'next/link';
import { useSearchParams } from '@/client/navigation';
import { useState, type ReactNode } from 'react';
import type { HighlightingGroup, Paginated, UserCard } from '@/lib';
import { api, query } from '@/client/api';
import { useApiQuery } from '@/client/hooks';
import { useCurrentUser } from '@/client/store';
import { EmptyState, Modal, PageHeader, PageLoading, Pagination } from '@/components/ui';
import { UserCardRow, UserTile } from '@/components/UserCardRow';

interface SearchResponse extends Paginated<UserCard> {
  newUsers: UserCard[];
  highlightings: HighlightingGroup[];
  castLevels: Array<{ id: number; name: string; color: string; sortIndex: number; memberCount: number }>;
  filterOptions: {
    meetingPreferences: Record<string, Array<{ id: number; name: string | null }>>;
    attributes: Record<string, string[]>;
    businessAreas: Array<{ id: number; name: string; color: string }>;
  };
}

/**
 * ProfilesController#search.
 *
 * The filter set is exactly what ProfileSearchQuery understands, so the query
 * parameters are passed through untouched and stay shareable as urls.
 */
export function SearchPage(): ReactNode {
  const user = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Number(searchParams.get('page') ?? 1);
  const { data, isLoading, refetch } = useApiQuery<SearchResponse>(
    ['profiles', 'search', searchParams.toString()],
    `/profiles/search?${searchParams.toString()}`,
  );

  function setParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  async function toggleFavorite(target: UserCard): Promise<void> {
    await api.post(`/profiles/${target.id}/toggle_favorite`);
    await refetch();
  }

  const hasFilters = [...searchParams.keys()].some((key) => key !== 'page');

  if (isLoading) return <PageLoading />;

  return (
    <div>
      <PageHeader
        title="探す"
        action={
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setFiltersOpen(true)}>
            絞り込み{hasFilters ? ' ●' : ''}
          </button>
        }
      />

      <div className="flex gap-2 px-4 py-3">
        <input
          className="input"
          placeholder="ニックネームで検索"
          defaultValue={searchParams.get('nick_name') ?? ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setParam('nick_name', (event.target as HTMLInputElement).value);
          }}
        />
        <Link href="/profiles/ranking" className="btn-secondary shrink-0 px-3 no-underline">
          🏆
        </Link>
      </div>

      {!hasFilters && data?.newUsers.length ? (
        <section>
          <h2 className="section-title">{user?.permissions.cast ? '新しいゲスト' : '新人キャスト'}</h2>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2">
            {data.newUsers.map((candidate) => (
              <div key={candidate.id} className="w-20 shrink-0">
                <UserTile user={candidate} to={`/profiles/${candidate.id}`} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!hasFilters && data?.castLevels.length ? (
        <section>
          <h2 className="section-title">タイプから探す</h2>
          <div className="flex flex-wrap gap-2 px-4 pb-2">
            {data.castLevels.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => setParam('cast_level_id', String(level.id))}
                className="badge border border-ink-300 bg-white px-2.5 py-1 text-ink-900"
              >
                {level.name} ({level.memberCount})
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!hasFilters && data?.highlightings.length
        ? data.highlightings.map((group) =>
            group.entries.length ? (
              <section key={group.id}>
                <h2 className="section-title">{group.categoryName}</h2>
                {group.note ? <p className="px-4 pb-1 text-[11px] text-ink-500">{group.note}</p> : null}
                <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="w-20 shrink-0">
                      <UserTile user={entry.user} to={`/profiles/${entry.user.id}`} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null,
          )
        : null}

      <h2 className="section-title">{hasFilters ? `検索結果 ${data?.totalCount ?? 0}件` : 'すべて'}</h2>
      {data?.items.length ? (
        <ul>
          {data.items.map((candidate) => (
            <UserCardRow
              key={candidate.id}
              user={candidate}
              to={`/profiles/${candidate.id}`}
              showFee
              right={
                <button
                  type="button"
                  className="shrink-0 p-2 text-lg"
                  onClick={(event) => {
                    event.preventDefault();
                    void toggleFavorite(candidate);
                  }}
                  aria-label="お気に入り"
                >
                  {candidate.favorited ? '★' : '☆'}
                </button>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState title="該当する方が見つかりませんでした" hint="条件を変えてお試しください" />
      )}

      <Pagination
        page={page}
        totalPages={data?.totalPages ?? 1}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams);
          params.set('page', String(next));
          setSearchParams(params);
        }}
      />

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="絞り込み"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                setSearchParams(new URLSearchParams());
                setFiltersOpen(false);
              }}
            >
              クリア
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => setFiltersOpen(false)}>
              適用する
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <FilterSelect
            label="ステータス"
            value={searchParams.get('status') ?? ''}
            options={[
              { value: '', label: '指定なし' },
              { value: 'online', label: 'オンライン' },
              { value: 'offline', label: 'オフライン' },
            ]}
            onChange={(value) => setParam('status', value)}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={searchParams.get('favorites_only') === '1'}
              onChange={(event) => setParam('favorites_only', event.target.checked ? '1' : '')}
            />
            お気に入りのみ
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={searchParams.get('new_cast') === '1'}
              onChange={(event) => setParam('new_cast', event.target.checked ? '1' : '')}
            />
            新人のみ
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={searchParams.get('can_speak_english') === '1'}
              onChange={(event) => setParam('can_speak_english', event.target.checked ? '1' : '')}
            />
            英語OK
          </label>

          <div className="grid grid-cols-2 gap-2">
            <FilterNumber
              label="年齢（下限）"
              value={searchParams.get('min_age') ?? ''}
              onChange={(value) => setParam('min_age', value)}
            />
            <FilterNumber
              label="年齢（上限）"
              value={searchParams.get('max_age') ?? ''}
              onChange={(value) => setParam('max_age', value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FilterNumber
              label="身長"
              value={searchParams.get('height') ?? ''}
              onChange={(value) => setParam('height', value)}
            />
            <FilterNumber
              label="身長の許容差"
              value={searchParams.get('height_variance') ?? ''}
              onChange={(value) => setParam('height_variance', value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FilterNumber
              label="料金（下限）"
              value={searchParams.get('order_fee_per_time_lower_limit') ?? ''}
              onChange={(value) => setParam('order_fee_per_time_lower_limit', value)}
            />
            <FilterNumber
              label="料金（上限）"
              value={searchParams.get('order_fee_per_time_upper_limit') ?? ''}
              onChange={(value) => setParam('order_fee_per_time_upper_limit', value)}
            />
          </div>

          {data?.filterOptions.businessAreas.length ? (
            <FilterSelect
              label="支店"
              value={searchParams.get('business_area_id') ?? ''}
              options={[
                { value: '', label: '指定なし' },
                ...data.filterOptions.businessAreas.map((area) => ({ value: String(area.id), label: area.name })),
              ]}
              onChange={(value) => setParam('business_area_id', value)}
            />
          ) : null}

          {data?.filterOptions.attributes['年収']?.length ? (
            <FilterSelect
              label="年収"
              value={searchParams.get('income') ?? ''}
              options={[
                { value: '', label: '指定なし' },
                ...data.filterOptions.attributes['年収'].map((value) => ({ value, label: value })),
              ]}
              onChange={(value) => setParam('income', value)}
            />
          ) : null}

          {/* the *_class filters map onto MeetingPreferencesSchema subcategories */}
          {Object.entries(CLASS_PARAMS).map(([param, subcategory]) => {
            const options = data?.filterOptions.meetingPreferences[subcategory] ?? [];
            if (!options.length) return null;
            return (
              <FilterSelect
                key={param}
                label={subcategory}
                value={searchParams.get(param) ?? ''}
                options={[
                  { value: '', label: '指定なし' },
                  ...options.map((option) => ({ value: option.name ?? '', label: option.name ?? '' })),
                ]}
                onChange={(value) => setParam(param, value)}
              />
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

/** ProfileSearchQuery's param2name mapping. */
const CLASS_PARAMS: Record<string, string> = {
  age_class: '年齢',
  size_class: '身長',
  style_class: 'スタイル',
  looks_class: 'ルックス',
  type_class: 'タイプ',
  work_class: '職業',
  smoking_class: 'タバコ',
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export { query };
