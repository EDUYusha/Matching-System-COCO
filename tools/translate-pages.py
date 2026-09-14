#!/usr/bin/env python3
"""
Ports the coco-v2 screens into the App Router, on the light theme.

Two mechanical jobs:

  1. react-router -> next/navigation. `<Link to>` becomes `<Link href>`,
     `useNavigate()` becomes `useRouter()`, and every file gains 'use client'
     (these screens are interactive: wizards, chat, filters, forms).

  2. The palette. v2 painted light text on a dark ground; v3 does the reverse,
     so the ink ramp inverts for text and flips role for surfaces, and the gold
     moves to its 700/800 steps wherever it carries text — at its brand value it
     fails contrast on paper.

The component bodies, the Japanese copy and the data flow are otherwise
untouched.
"""

from __future__ import annotations

import pathlib
import re

SRC = pathlib.Path('../coco-v2/apps/web/src')
OUT = pathlib.Path('src/components/screens')

# Longest keys first so `text-ink-300` never matches inside `text-ink-30`.
PALETTE: list[tuple[str, str]] = [
    # --- surfaces -----------------------------------------------------------
    ('bg-ink-900/97', 'bg-paper-100/90'),
    ('bg-ink-900/95', 'bg-paper-100/90'),
    ('bg-ink-900/80', 'bg-paper-100/85'),
    ('bg-ink-800/97', 'bg-white/95'),
    ('bg-ink-800/60', 'bg-ink-50'),
    ('bg-ink-900', 'bg-paper-100'),
    ('bg-ink-800', 'bg-white'),
    ('bg-ink-700', 'bg-ink-100'),
    ('bg-ink-600', 'bg-ink-200'),
    ('bg-black/60', 'bg-ink-900/40'),
    ('bg-white/50', 'bg-white'),

    # --- gold: keep the identity, move text to a readable step --------------
    ('bg-gold-900/30', 'bg-gold-100'),
    ('bg-gold-900/25', 'bg-gold-100'),
    ('bg-gold-900/20', 'bg-gold-50'),
    ('bg-gold-900/15', 'bg-gold-50'),
    ('bg-gold/20', 'bg-gold-100'),
    ('bg-gold/10', 'bg-gold-50'),
    ('bg-gold', 'bg-gold-500'),
    ('text-gold-100', 'text-gold-800'),
    ('text-gold', 'text-gold-700'),
    ('border-gold/40', 'border-gold-300'),
    ('border-gold/30', 'border-gold-300'),
    ('border-gold/25', 'border-gold-200'),
    ('border-gold', 'border-gold-500'),
    ('ring-gold', 'ring-gold-400'),

    # --- text: the ink ramp inverts ----------------------------------------
    # ink-950/900 was the *dark* text sitting on a gold button; it stays dark
    ('text-ink-950', 'text-ink-900'),
    ('text-ink-50', 'text-ink-900'),
    ('text-ink-100', 'text-ink-900'),
    ('text-ink-200', 'text-ink-700'),
    ('text-ink-300', 'text-ink-500'),
    ('text-ink-400', 'text-ink-500'),

    # --- hairlines ----------------------------------------------------------
    ('border-ink-900', 'border-ink-200'),
    ('border-ink-800', 'border-ink-200'),
    ('border-ink-700', 'border-ink-200'),
    ('border-ink-600', 'border-ink-300'),
    ('divide-ink-800', 'divide-ink-200'),
    ('divide-ink-700', 'divide-ink-200'),

    # --- hovers -------------------------------------------------------------
    ('hover:bg-ink-800', 'hover:bg-ink-50'),
    ('hover:bg-ink-700', 'hover:bg-ink-100'),
    ('hover:text-ink-100', 'hover:text-ink-900'),

    # --- status colours picked for a dark ground ----------------------------
    ('text-red-300', 'text-red-600'),
    ('text-red-400', 'text-red-600'),
    ('text-emerald-300', 'text-emerald-600'),
    ('text-emerald-400', 'text-emerald-600'),
    ('text-amber-300', 'text-amber-600'),
    ('text-sky-300', 'text-sky-600'),
    ('bg-emerald-400', 'bg-emerald-500'),
]


def repaint(text: str) -> str:
    for old, new in PALETTE:
        text = re.sub(rf'(?<![\w-]){re.escape(old)}(?![\w-])', new, text)
    return text


def to_next(text: str, here: pathlib.Path, pages_root: pathlib.Path) -> str:
    """react-router -> next/navigation."""
    # the router imports
    text = re.sub(r"^import \{[^}]*\} from 'react-router-dom';\n", '', text, flags=re.M)

    needs_link = re.search(r'<Link\b', text)
    hooks = []
    if re.search(r'\buseNavigate\b', text):
        hooks.append('useRouter')
    if re.search(r'\buseParams\b', text):
        hooks.append('useParams')
    if re.search(r'\buseSearchParams\b', text):
        hooks.append('useSearchParams')
    if re.search(r'\buseLocation\b', text):
        hooks.append('usePathname')

    compat = 'useSearchParams' in hooks
    hooks = [h for h in hooks if h != 'useSearchParams']

    imports = []
    if needs_link:
        imports.append("import Link from 'next/link';")
    if hooks:
        imports.append(f"import {{ {', '.join(sorted(set(hooks)))} }} from 'next/navigation';")
    if compat:
        imports.append("import { useSearchParams } from '@/client/navigation';")

    # <Link to="x"> -> <Link href="x">
    text = re.sub(r'(<Link\b[^>]*?)\bto=', r'\1href=', text, flags=re.S)
    # <Navigate to="x" replace /> has no Next equivalent in a client component;
    # the callers that used it are hand-finished, so flag rather than guess
    text = text.replace('useNavigate()', 'useRouter()')
    text = re.sub(r'\bnavigate\((.+?),\s*\{\s*replace:\s*true\s*\}\)', r'router.replace(\1)', text)
    text = re.sub(r'\bnavigate\(', 'router.push(', text)
    text = re.sub(r'\bconst navigate = useRouter\(\)', 'const router = useRouter()', text)
    text = text.replace('useLocation()', 'usePathname()')

    # module paths
    text = text.replace("from '@coco/shared'", "from '@/lib'")
    text = re.sub(r"from '(?:\.\./)+lib/([a-z-]+)\.js'", r"from '@/client/\1'", text)
    text = re.sub(r"from '(?:\.\./)+components/([A-Za-z]+)\.js'", r"from '@/components/\1'", text)
    # a sibling screen keeps its folder: ../profile/ProfilePage -> screens/profile/ProfilePage
    def screen_path(match: re.Match) -> str:
        rel = (here.parent / match.group(1)).resolve()
        return "from '@/components/screens/%s'" % rel.relative_to(pages_root.resolve()).as_posix()

    text = re.sub(r"from '((?:\./|\.\./)[A-Za-z0-9_/.-]+)\.js'", screen_path, text)
    text = re.sub(r"\.js'", "'", text)

    head = '\n'.join(imports)
    if head:
        # place the new imports after the first import line that survives
        lines = text.split('\n')
        for index, line in enumerate(lines):
            if line.startswith('import '):
                lines.insert(index, head)
                break
        else:
            lines.insert(0, head)
        text = '\n'.join(lines)

    if not text.lstrip().startswith("'use client'"):
        text = "'use client';\n\n" + text.lstrip()
    return text


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = 0
    for source in sorted((SRC / 'pages').rglob('*.tsx')):
        rel = source.relative_to(SRC / 'pages')
        target = OUT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(repaint(to_next(source.read_text(), source, SRC / 'pages')))
        written += 1

    for name in ('Layout', 'MeetingCard', 'UserCardRow'):
        source = SRC / 'components' / f'{name}.tsx'
        if source.exists():
            ported = repaint(to_next(source.read_text(), source, SRC / 'components'))
            # these three live beside the ui kit, not under screens/
            ported = ported.replace('@/components/screens/', '@/components/')
            (pathlib.Path('src/components') / f'{name}.tsx').write_text(ported)
            written += 1

    print(f'ported {written} screen files')


if __name__ == '__main__':
    main()
