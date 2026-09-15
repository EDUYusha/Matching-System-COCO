'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useAppStore, useCounters, useCurrentUser } from '@/client/store';
import { useCableSubscription } from '@/client/hooks';
import { Counter } from '@/components/ui';

/**
 * The app shell: the bottom navigation from _bottomnavbar.html.erb and the flash
 * area. The five tabs and which routes light them up follow
 * ApplicationHelper#active_menu_class.
 */

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: string;
  badge?: number;
  matches: (path: string, userType: string) => boolean;
}

export function Layout({ children }: { children: ReactNode }): ReactNode {
  useCableSubscription();
  const user = useCurrentUser();
  const counters = useCounters();
  const pathname = usePathname();

  const isCast = !!user?.permissions.cast;

  const items: NavItem[] = [
    {
      key: 'home',
      // cast see the order board where guests see home
      label: isCast ? '呼ばれる' : '呼ぶ',
      to: isCast ? '/meetings' : '/home',
      icon: isCast ? '🍶' : '🎉',
      badge: isCast ? counters.availableMeetingsCount : 0,
      matches: (path) => path === '/home' || path.startsWith('/meetings'),
    },
    {
      key: 'search',
      label: '探す',
      to: '/profiles/search',
      icon: '🔍',
      matches: (path) => path.startsWith('/profiles'),
    },
    {
      key: 'conversations',
      label: 'チャット',
      to: '/conversations',
      icon: '💬',
      badge: counters.unreadMessagesCount,
      matches: (path) => path.startsWith('/conversations'),
    },
    {
      key: 'posts',
      label: 'つぶやき',
      to: '/posts',
      icon: '📝',
      badge: counters.unreadPostsCount,
      matches: (path) => path.startsWith('/posts'),
    },
    {
      key: 'settings',
      label: 'マイページ',
      to: '/user/settings',
      icon: '👤',
      badge: counters.unreadServiceMessagesCount,
      matches: (path) =>
        path.startsWith('/user') ||
        path.startsWith('/profile') ||
        path.startsWith('/financial') ||
        path.startsWith('/help') ||
        path.startsWith('/friendships') ||
        path.startsWith('/cast'),
    },
  ];

  // the chat thread and the order wizard are full-bleed, as in the original
  const hideNav =
    /^\/conversations\/\d+/.test(pathname) ||
    pathname.startsWith('/meetings/new') ||
    pathname.startsWith('/users/new') ||
    pathname.startsWith('/cast/new');

  return (
    <div className="app-shell flex flex-col">
      <Flashes />
      <RequiredActionBanner />
      <main className={clsx('flex-1', hideNav ? 'pb-0' : 'pb-[68px]')}>
        {children}
      </main>

      {hideNav ? null : (
        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-app -translate-x-1/2 border-t border-ink-200 bg-paper-100/90 backdrop-blur">
          <ul className="flex">
            {items.map((item) => {
              const active = item.matches(pathname, user?.userType ?? '');
              return (
                <li key={item.key} className="flex-1">
                  <Link
                    href={item.to}
                    className={clsx(
                      'relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] no-underline transition',
                      active ? 'text-gold-700' : 'text-ink-500',
                    )}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.label}</span>
                    {item.badge ? (
                      <Counter count={item.badge} className="absolute right-1/4 top-1" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

function Flashes(): ReactNode {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  if (!toasts.length) return null;

  return (
    <div className="fixed left-1/2 top-2 z-50 w-full max-w-app -translate-x-1/2 space-y-2 px-3">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={clsx(
            'block w-full rounded-lg border px-3 py-2.5 text-left text-xs leading-relaxed shadow-lg',
            toast.type === 'alert' || toast.type === 'danger'
              ? 'border-red-200 bg-red-50 text-red-800'
              : toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-gold-300 bg-white text-ink-900',
          )}
        >
          {/* the original's flashes contain <br> and links */}
          <span dangerouslySetInnerHTML={{ __html: toast.message }} />
        </button>
      ))}
    </div>
  );
}

/**
 * ApplicationController#check_phone_number_presence and #check_customers_selected
 * redirected on every request until the user complied; this surfaces the same
 * requirement as a banner the user cannot miss.
 */
function RequiredActionBanner(): ReactNode {
  const requiredAction = useAppStore((state) => state.requiredAction);
  const pathname = usePathname();
  if (!requiredAction) return null;
  if (pathname === requiredAction.path) return null;

  return (
    <div className="border-b border-gold-300 bg-gold-100 px-4 py-2.5 text-xs text-gold-800">
      <span dangerouslySetInnerHTML={{ __html: requiredAction.message ?? 'お手続きが必要です。' }} />{' '}
      <Link href={requiredAction.path} className="font-semibold underline">
        こちら
      </Link>
    </div>
  );
}
