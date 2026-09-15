'use client';

import { create } from 'zustand';
import type { CurrentUser, FlashMessage, NavCounters } from '@/lib';

/**
 * Global UI state: the signed-in user, the navigation badge counts and the flash
 * queue. Flash replaces Rails' `flash[:notice]` / `flash[:alert]`, which the API
 * still returns with each action so the wording is unchanged.
 */

export interface RequiredAction {
  action: string;
  path: string;
  message?: string;
}

interface Toast extends FlashMessage {
  id: number;
}

interface AppState {
  user: CurrentUser | null;
  requiredAction: RequiredAction | null;
  counters: NavCounters;
  toasts: Toast[];
  bootstrapped: boolean;

  setUser: (user: CurrentUser | null, requiredAction?: RequiredAction | null) => void;
  setCounters: (counters: Partial<NavCounters>) => void;
  setBootstrapped: (value: boolean) => void;
  pushToast: (flash: FlashMessage) => void;
  dismissToast: (id: number) => void;
}

const emptyCounters: NavCounters = {
  unreadMessagesCount: 0,
  unreadPostsCount: 0,
  unreadServiceMessagesCount: 0,
  availableMeetingsCount: 0,
  availability: false,
};

let toastId = 0;

export const useAppStore = create<AppState>((set) => ({
  user: null,
  requiredAction: null,
  counters: emptyCounters,
  toasts: [],
  bootstrapped: false,

  setUser: (user, requiredAction = null) => set({ user, requiredAction }),
  setCounters: (counters) => set((state) => ({ counters: { ...state.counters, ...counters } })),
  setBootstrapped: (value) => set({ bootstrapped: value }),

  pushToast: (flash) => {
    toastId += 1;
    const toast = { ...flash, id: toastId };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    // flashes are transient, like the original's one-request lifetime
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((candidate) => candidate.id !== toast.id) }));
    }, 6000);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

/** Convenience selectors. */
export const useCurrentUser = () => useAppStore((state) => state.user);
export const useCounters = () => useAppStore((state) => state.counters);
