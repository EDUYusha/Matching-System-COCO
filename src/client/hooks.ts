'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { CurrentUser, FlashMessage, NavCounters } from '@/lib';
import { api, ApiRequestError } from '@/client/api';
import { useAppStore, type RequiredAction } from '@/client/store';
import { onCable, type CablePayload } from '@/client/socket';

/** Loads /api/me once and keeps the store in step with it. */
export function useBootstrap(): { loading: boolean } {
  const setUser = useAppStore((state) => state.setUser);
  const setBootstrapped = useAppStore((state) => state.setBootstrapped);
  const bootstrapped = useAppStore((state) => state.bootstrapped);

  const { isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const data = await api.get<{ user: CurrentUser | null; requiredAction: RequiredAction | null }>('/me');
      setUser(data.user, data.requiredAction);
      setBootstrapped(true);
      return data;
    },
    retry: false,
    staleTime: 30_000,
  });

  return { loading: isLoading && !bootstrapped };
}

/** The bottom navigation's badge counts. */
export function useCounters(enabled: boolean): void {
  const setCounters = useAppStore((state) => state.setCounters);

  useQuery({
    queryKey: ['counters'],
    queryFn: async () => {
      const data = await api.get<NavCounters>('/me/counters');
      setCounters(data);
      return data;
    },
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });
}

/**
 * A query that surfaces an API redirect. Several original actions answered with
 * `redirect_to … alert:` instead of data (an unpaid balance sending the guest to
 * the card screen, for instance); this follows that.
 */
export function useApiQuery<T>(
  key: unknown[],
  path: string,
  options: Partial<UseQueryOptions<T>> = {},
): ReturnType<typeof useQuery<T>> {
  const router = useRouter();
  const pushToast = useAppStore((state) => state.pushToast);

  const result = useQuery<T>({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    retry: false,
    ...options,
  });

  useEffect(() => {
    const error = result.error;
    if (!(error instanceof ApiRequestError)) return;
    if (error.flash) pushToast(error.flash);
    if (error.redirect) router.replace(error.redirect);
  }, [result.error, router, pushToast]);

  return result;
}

/** Subscribes to the cable and invalidates whatever the payload affects. */
export function useCableSubscription(handler?: (payload: CablePayload) => void): void {
  const queryClient = useQueryClient();
  const pushToast = useAppStore((state) => state.pushToast);

  useEffect(() => {
    return onCable((payload) => {
      switch (payload.action_type) {
        case 'message_received':
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['conversation', payload.conversation_id] });
          void queryClient.invalidateQueries({ queryKey: ['counters'] });
          break;
        case 'messages_read':
          void queryClient.invalidateQueries({ queryKey: ['conversation', payload.conversation_id] });
          break;
        case 'reload_page':
          void queryClient.invalidateQueries();
          break;
        case 'new_request':
          // the flash the cast sees when a matching order appears
          pushToast({ type: 'notice', message: payload.message });
          void queryClient.invalidateQueries({ queryKey: ['meetings'] });
          void queryClient.invalidateQueries({ queryKey: ['counters'] });
          break;
        case 'request_canceled':
          void queryClient.invalidateQueries({ queryKey: ['meetings'] });
          void queryClient.invalidateQueries({ queryKey: ['counters'] });
          break;
        default:
          break;
      }
      handler?.(payload);
    });
  }, [queryClient, pushToast, handler]);
}

/**
 * Runs an action, shows its flash and follows its redirect.
 *
 * Responses are read structurally rather than through a constrained generic,
 * because most endpoints return `{ ok, flash?, redirect? }` while a few return
 * only data.
 */
export function useAction(): {
  run: <T>(
    promise: Promise<T>,
    options?: { invalidate?: unknown[][]; onSuccess?: (result: T) => void },
  ) => Promise<T | null>;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pushToast = useAppStore((state) => state.pushToast);

  const run = async <T>(
    promise: Promise<T>,
    options: { invalidate?: unknown[][]; onSuccess?: (result: T) => void } = {},
  ): Promise<T | null> => {
    try {
      const result = await promise;
      const envelope = (result ?? {}) as { flash?: FlashMessage; redirect?: string };
      if (envelope.flash) pushToast(envelope.flash);
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ['counters'] });
      options.onSuccess?.(result);
      if (envelope.redirect) router.push(envelope.redirect);
      return result;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        pushToast(error.flash ?? { type: 'alert', message: error.message });
        if (error.redirect) router.push(error.redirect);
      } else {
        pushToast({ type: 'alert', message: (error as Error).message });
      }
      return null;
    }
  };

  return { run };
}
