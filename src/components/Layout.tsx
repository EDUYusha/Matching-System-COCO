'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useAppStore, useCounters, useCurrentUser } from '@/client/store';
import { useCableSubscription } from '@/client/hooks';
import { ChatIcon, HomeIcon, PersonIcon, PostIcon, SearchIcon } from '@/components/icons';
import { Counter } from '@/components/ui';

/**
 * The app shell: the bottom navigation from _bottomnavbar.html.erb and the flash
 * area. The five tabs and which routes light them up follow
 * ApplicationHelper#active_menu_class; the bar itself is drawn as LINE's is,
 * with outline icons that darken and thicken on the active tab.
 */

interface NavItem {
  key: string;
  label: string;
  to: string;
  Icon: (props: { className?: string; strokeWidth?: number }) => ReactNode;
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
      Icon: HomeIcon,
      badge: isCast ? counters.availableMeetingsCount : 0,
      matches: (path) => path === '/home' || path.startsWith('/meetings'),
    },
    {
      key: 'search',
      label: '探す',
      to: '/profiles/search',
      Icon: SearchIcon,
      matches: (path) => path.startsWith('/profiles'),
    },
    {
      key: 'conversations',
      label: 'チャット',
      to: '/conversations',
      Icon: ChatIcon,
      badge: counters.unreadMessagesCount,
      matches: (path) => path.startsWith('/conversations'),
    },
    {
      key: 'posts',
      label: 'つぶやき',
      to: '/posts',
      Icon: PostIcon,
      badge: counters.unreadPostsCount,
      matches: (path) => path.startsWith('/posts'),
    },
    {
      key: 'settings',
      label: 'マイページ',
      to: '/user/settings',
      Icon: PersonIcon,
      badge: counters.unreadServiceMessagesCount,
      // `/profile` is my own profile; `/profiles/...` belongs to the search tab
      matches: (path) =>
        path.startsWith('/user') ||
        path === '/profile' ||
        path.startsWith('/profile/') ||
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
      <main className={clsx('flex-1', hideNav ? 'pb-0' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]')}>
        {children}
      </main>

      {hideNav ? null : (
        <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-app -translate-x-1/2 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <ul className="flex h-14">
            {items.map((item) => {
              const active = item.matches(pathname, user?.userType ?? '');
              return (
                <li key={item.key} className="flex-1">
                  <Link
                    href={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] no-underline transition',
                      active ? 'font-bold text-ink-900' : 'text-ink-500',
                    )}
                  >
                    <item.Icon className="h-6 w-6" strokeWidth={active ? 2.3 : 1.7} />
                    <span>{item.label}</span>
                    {item.badge ? (
                      <Counter count={item.badge} className="absolute left-1/2 top-1 ml-1" />
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

/** Flashes, shown as LINE's dark floating toasts; an alert turns red. */
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
            'block w-full rounded-xl px-4 py-3 text-left text-[13px] leading-relaxed text-white shadow-lg [&_a]:text-white [&_a]:underline',
            toast.type === 'alert' || toast.type === 'danger' ? 'bg-red-600' : 'bg-ink-900/90',
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
    <div className="border-b border-brand-200 bg-brand-50 px-4 py-2.5 text-xs text-brand-800">
      <span dangerouslySetInnerHTML={{ __html: requiredAction.message ?? 'お手続きが必要です。' }} />{' '}
      <Link href={requiredAction.path} className="font-bold text-brand-800 underline">
        こちら
      </Link>
    </div>
  );
}
