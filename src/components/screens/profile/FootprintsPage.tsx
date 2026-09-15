'use client';

import { useState, type ReactNode } from 'react';
import type { Paginated, UserCard } from '@/lib';
import { formatRelative } from '@/client/format';
import { useApiQuery } from '@/client/hooks';
import { EmptyState, PageHeader, PageLoading, Pagination } from '@/components/ui';
import { UserCardRow } from '@/components/UserCardRow';

interface Footprint {
  id: number;
  createdAt: string;
  unread: boolean;
  user: UserCard;
}

/** ProfilesController#footprints. */
export function FootprintsPage(): ReactNode {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApiQuery<Paginated<Footprint>>(
    ['footprints', page],
    `/profile/footprints?page=${page}`,
  );

  if (isLoading) return <PageLoading />;

  return (
    <div>
      <PageHeader title="足あと" back="/profile/settings" subtitle={`${data?.totalCount ?? 0}件`} />
      {data?.items.length ? (
        <ul>
          {data.items.map((footprint) => (
            <UserCardRow
              key={footprint.id}
              user={footprint.user}
              to={`/profiles/${footprint.user.id}`}
              right={<span className="shrink-0 text-[11px] text-ink-500">{formatRelative(footprint.createdAt)}</span>}
            />
          ))}
        </ul>
      ) : (
        <EmptyState title="まだ足あとはありません" />
      )}
      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
