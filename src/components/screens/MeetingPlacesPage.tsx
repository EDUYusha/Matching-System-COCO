'use client';

import { useState, type ReactNode } from 'react';
import type { Paginated } from '@/lib';
import { useApiQuery } from '@/client/hooks';
import { EmptyState, PageHeader, PageLoading, Pagination } from '@/components/ui';

interface MeetingPlace {
  id: number;
  name: string;
  url: string | null;
  phone: string | null;
  address: string | null;
  description: string | null;
  imageUrls: string[];
  areaId: number;
  areaName: string;
  tags: Array<{ id: number; name: string }>;
}

interface Response extends Paginated<MeetingPlace> {
  businessAreas: Array<{ id: number; name: string; color: string }>;
  areas: Array<{ id: number; name: string; businessAreaId: number }>;
  tags: Array<{ id: number; name: string }>;
}

/** MeetingPlacesController#index — the partner-venue directory. */
export function MeetingPlacesPage(): ReactNode {
  const [page, setPage] = useState(1);
  const [areaId, setAreaId] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);

  const params = new URLSearchParams({ page: String(page) });
  if (areaId) params.set('area_id', areaId);
  for (const tagId of tagIds) params.append('tag_ids', String(tagId));

  const { data, isLoading } = useApiQuery<Response>(
    ['meeting_places', params.toString()],
    `/meeting_places?${params.toString()}`,
  );

  if (isLoading) return <PageLoading />;

  return (
    <div>
      <PageHeader title="協力店" back="/user/settings" />

      <div className="space-y-2 px-4 py-3">
        <select
          className="input"
          value={areaId}
          onChange={(event) => {
            setAreaId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">すべてのエリア</option>
          {data?.areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1.5">
          {data?.tags.map((tag) => {
            const active = tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  setTagIds(active ? tagIds.filter((id) => id !== tag.id) : [...tagIds, tag.id]);
                  setPage(1);
                }}
                className={`badge px-2.5 py-1 ${active ? 'bg-brand-500 text-white' : 'border border-ink-300 bg-white text-ink-700'}`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>

      {data?.items.length ? (
        <ul className="divide-y divide-ink-200 border-y border-ink-200">
          {data.items.map((place) => (
            <li key={place.id} className="px-4 py-4">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-semibold">{place.name}</p>
                <span className="badge bg-ink-100 text-ink-700">{place.areaName}</span>
              </div>
              {place.imageUrls.length ? (
                <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
                  {place.imageUrls.map((url) => (
                    <img key={url} src={url} alt="" className="h-24 shrink-0 rounded object-cover" />
                  ))}
                </div>
              ) : null}
              {place.description ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{place.description}</p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-ink-500">
                {place.address ? <span>{place.address}</span> : null}
                {place.phone ? <a href={`tel:${place.phone}`}>{place.phone}</a> : null}
                {place.url ? (
                  <a href={place.url} target="_blank" rel="noopener noreferrer">
                    サイトを見る
                  </a>
                ) : null}
              </div>
              {place.tags.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {place.tags.map((tag) => (
                    <span key={tag.id} className="badge bg-ink-100 text-ink-500">
                      {tag.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="協力店が見つかりませんでした" />
      )}

      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
