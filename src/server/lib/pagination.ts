import type { Paginated } from '@/lib';

/** Kaminari's `page(n).per(m)` translated to Prisma skip/take. */
export function paginationArgs(page: number | undefined, perPage: number): { skip: number; take: number } {
  const p = Math.max(1, Number(page) || 1);
  return { skip: (p - 1) * perPage, take: perPage };
}

export function paginate<T>(items: T[], totalCount: number, page: number | undefined, perPage: number): Paginated<T> {
  const p = Math.max(1, Number(page) || 1);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  return {
    items,
    page: p,
    perPage,
    totalCount,
    totalPages,
    hasMore: p < totalPages,
  };
}

/**
 * Several original screens fetched `per + 1` rows to learn whether another page
 * exists without running a COUNT (CreditTransaction.for_customer,
 * ConversationsController#show). This keeps that cheaper pattern.
 */
export function takeWithOverflow<T>(rows: T[], perPage: number): { items: T[]; overflow: T | null } {
  if (rows.length > perPage) {
    const items = rows.slice(0, perPage);
    return { items, overflow: rows[perPage] };
  }
  return { items: rows, overflow: null };
}
