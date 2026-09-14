'use client';

import { useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * react-router's `useSearchParams` tuple, on top of Next's read-only one.
 *
 * The screens push filter and pagination state into the query string and read
 * it back; Next only gives the reading half. Rather than rewrite every screen,
 * the writing half is provided here and navigates with the App Router.
 */
export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | Record<string, string>, options?: { replace?: boolean }) => void,
] {
  const params = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const current = useMemo(() => new URLSearchParams(params?.toString() ?? ''), [params]);

  const set = useCallback(
    (next: URLSearchParams | Record<string, string>, options?: { replace?: boolean }) => {
      const search = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const query = search.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options?.replace) router.replace(url);
      else router.push(url);
    },
    [pathname, router],
  );

  return [current, set];
}
