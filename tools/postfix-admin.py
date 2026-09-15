#!/usr/bin/env python3
"""Hand-written corrections applied after tools/translate-admin.py."""

from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def edit(rel: str, pairs: list[tuple[str, str]]) -> None:
    path = ROOT / rel
    text = path.read_text()
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new)
        elif new in text:
            continue
        else:
            raise SystemExit(f'postfix miss in {rel}: {old[:70]!r}')
    path.write_text(text)
    print(f'  {rel}')


print('postfix admin:')

edit('src/components/admin/Layout.tsx', [
    ('export function Layout(): ReactNode {',
     'export function Layout({ children }: { children: ReactNode }): ReactNode {'),
    ('          <Outlet />\n', '          {children}\n'),
    # NavLink has no Next equivalent; usePathname + Link does the same job
    ("""function NavItem({ to, label }: { to: string; label: string }): ReactNode {
  // NavLink's own matching ignores the query string, which several entries rely on
  const path = to.split('?')[0];
  const search = to.includes('?') ? `?${to.split('?')[1]}` : '';

  return (
    <NavLink
      to={to}
      end={path === '/'}
      className={({ isActive }) =>
        clsx(
          'pill-nav no-underline hover:no-underline',
          isActive && (!search || window.location.search === search) && 'pill-nav-active',
        )
      }
    >
      {label}
    </NavLink>
  );
}""",
     """function NavItem({ to, label }: { to: string; label: string }): ReactNode {
  // several entries differ only by their query string, so the active test looks
  // at both halves — react-router's NavLink ignored the query
  const pathname = usePathname();
  const currentSearch = useSearchParams()[0].toString();

  const [path, search = ''] = to.split('?');
  const active =
    (path === '/admin' ? pathname === '/admin' : pathname.startsWith(path)) &&
    (!search || currentSearch === search);

  return (
    <Link
      href={to}
      className={clsx('pill-nav no-underline hover:no-underline', active && 'pill-nav-active')}
    >
      {label}
    </Link>
  );
}"""),
    ("import { useRouter } from 'next/navigation';",
     "import { usePathname, useRouter } from 'next/navigation';"),
    ("import Link from 'next/link';",
     "import Link from 'next/link';\nimport { useSearchParams } from '@/client/navigation';"),
])

# the panel's gate: /admin/login renders bare, everything else waits for
# /api/admin/me and shows the login form when there is no session
(ROOT / 'src/components/admin/AdminShell.tsx').write_text("""'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Layout } from '@/components/admin/Layout';
import { LoginPage } from '@/components/admin/LoginPage';
import { useBootstrap } from '@/client/admin-hooks';
import { useAdmin } from '@/client/admin-store';
import { Loading } from '@/components/admin/ui';

/**
 * The panel's gate. /admin/login renders bare; everything else waits for
 * /api/admin/me and shows the login form instead when there is no session.
 */
export function AdminShell({ children }: { children: ReactNode }): ReactNode {
  const { loading } = useBootstrap();
  const admin = useAdmin();
  const pathname = usePathname();

  if (pathname === '/admin/login') return <>{children}</>;
  if (loading) return <Loading />;
  if (!admin) return <LoginPage />;

  return <Layout>{children}</Layout>;
}
""")
print('  src/components/admin/AdminShell.tsx')

print('done')
