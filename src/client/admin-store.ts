'use client';

import { create } from 'zustand';
import type { FlashMessage } from '@/lib';

export interface AdminUser {
  id: number;
  loginName: string;
  businessAreaId: number | null;
  businessAreaName?: string | null;
}

interface Toast extends FlashMessage {
  id: number;
}

interface AdminState {
  admin: AdminUser | null;
  bootstrapped: boolean;
  toasts: Toast[];
  setAdmin: (admin: AdminUser | null) => void;
  setBootstrapped: (value: boolean) => void;
  pushToast: (flash: FlashMessage) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useAdminStore = create<AdminState>((set) => ({
  admin: null,
  bootstrapped: false,
  toasts: [],
  setAdmin: (admin) => set({ admin }),
  setBootstrapped: (value) => set({ bootstrapped: value }),
  pushToast: (flash) => {
    toastId += 1;
    const toast = { ...flash, id: toastId };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((candidate) => candidate.id !== toast.id) })), 5000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const useAdmin = () => useAdminStore((state) => state.admin);
