'use client';

import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, ApiRequestError } from '@/client/admin-api';
import { useAdminStore, type AdminUser } from '@/client/admin-store';

export function useBootstrap(): { loading: boolean } {
  const setAdmin = useAdminStore((state) => state.setAdmin);
  const setBootstrapped = useAdminStore((state) => state.setBootstrapped);
  const bootstrapped = useAdminStore((state) => state.bootstrapped);

  const { isLoading } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      const data = await api.get<{ admin: AdminUser | null }>('/admin/me');
      setAdmin(data.admin);
      setBootstrapped(true);
      return data;
    },
    retry: false,
    staleTime: 60_000,
  });

  return { loading: isLoading && !bootstrapped };
}

export function useAdminQuery<T>(
  key: unknown[],
  path: string,
  options: Partial<UseQueryOptions<T>> = {},
): ReturnType<typeof useQuery<T>> {
  return useQuery<T>({ queryKey: key, queryFn: () => api.get<T>(path), retry: false, ...options });
}

/** Runs a mutation, toasts the outcome and invalidates the given keys. */
export function useAdminAction(): {
  run: <T>(promise: Promise<T>, options?: { invalidate?: unknown[][]; success?: string }) => Promise<T | null>;
} {
  const queryClient = useQueryClient();
  const pushToast = useAdminStore((state) => state.pushToast);

  const run = async <T,>(
    promise: Promise<T>,
    options: { invalidate?: unknown[][]; success?: string } = {},
  ): Promise<T | null> => {
    try {
      const result = await promise;
      if (options.success) pushToast({ type: 'success', message: options.success });
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      return result;
    } catch (error) {
      pushToast(
        error instanceof ApiRequestError
          ? (error.flash ?? { type: 'alert', message: error.message })
          : { type: 'alert', message: (error as Error).message },
      );
      return null;
    }
  };

  return { run };
}
