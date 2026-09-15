#!/usr/bin/env python3
"""
Hand-written corrections applied after tools/translate-pages.py.

Three things react-router expressed that the App Router expresses differently
and a regex should not guess at: `<Outlet/>`, `useLocation().pathname`, and
navigation state. Kept here so the port stays repeatable.
"""

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
            continue                       # already applied
        else:
            raise SystemExit(f'postfix miss in {rel}: {old[:70]!r}')
    path.write_text(text)
    print(f'  {rel}')


print('postfix pages:')

edit('src/components/Layout.tsx', [
    # an App Router layout receives children instead of rendering an <Outlet/>
    ('export function Layout(): ReactNode {',
     'export function Layout({ children }: { children: ReactNode }): ReactNode {'),
    ('        <Outlet />\n', '        {children}\n'),
    # Next's usePathname returns the path itself, not a location object
    ('  const location = usePathname();', '  const pathname = usePathname();'),
    ('location.pathname', 'pathname'),
    # the app is phone-first: v2 got this from `#root`, which the App Router
    # has no equivalent of, so the shell carries it
    ('    <div className="flex min-h-screen flex-col">',
     '    <div className="app-shell flex flex-col">'),
    # the flash colours were picked for a dark ground
    ("""              ? 'border-red-500/50 bg-red-950/95 text-red-100'
              : toast.type === 'success'
                ? 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100'
                : 'border-gold-300 bg-white/95 text-ink-900',""",
     """              ? 'border-red-200 bg-red-50 text-red-800'
              : toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-gold-300 bg-white text-ink-900',"""),
])

# react-router carried the intended destination in navigation state; the App
# Router has no equivalent, so AppShell puts it in the query string instead
edit('src/components/screens/auth/LoginPage.tsx', [
    ("import { usePathname, useRouter } from 'next/navigation';",
     "import { useRouter } from 'next/navigation';\nimport { useSearchParams } from '@/client/navigation';"),
    ("  const location = usePathname();", "  const [searchParams] = useSearchParams();"),
    ("(location.state as { prevPage?: string } | null)?.prevPage",
     "searchParams.get('prev_page') ?? undefined"),
])

print('done')
