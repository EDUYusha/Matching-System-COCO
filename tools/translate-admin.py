#!/usr/bin/env python3
"""
Ports the coco-v2 admin panel into the App Router, under /admin.

The panel was already a light "desk" theme, so unlike the member screens there
is no repainting to do beyond pointing its brand colour at the shared gold
scale. The work is the same react-router -> next/navigation substitution, plus
the admin client (its own cookie, its own /api/admin base).
"""

from __future__ import annotations

import pathlib
import re

SRC = pathlib.Path('../coco-v2/apps/admin/src')
OUT = pathlib.Path('src/components/admin')

# the panel's own scale, mapped onto the shared gold so both halves of the
# product use one set of tokens
BRAND = [
    ('brand-50', 'gold-50'), ('brand-100', 'gold-100'), ('brand-200', 'gold-200'),
    ('brand-300', 'gold-300'), ('brand-400', 'gold-400'), ('brand-500', 'gold-500'),
    ('brand-600', 'gold-600'), ('brand-700', 'gold-700'), ('brand-800', 'gold-800'),
    ('brand-900', 'gold-900'),
]


def repaint(text: str) -> str:
    for old, new in BRAND:
        text = re.sub(rf'(?<![\w-]){old}(?![\w-])', new, text)
    return text


# the panel was its own app at the root of :5174; here it is mounted under /admin
ADMIN_ROOTS = (
    'users', 'meetings', 'payout_requests', 'credit_conversions', 'credit_transactions',
    'access_requests', 'conversations', 'posts', 'reviews', 'blockings', 'broadcast',
    'rankings', 'service_messages', 'settings', 'login',
)


def remount(text: str) -> str:
    """Prefixes the panel's own links with /admin, leaving API paths alone."""
    roots = '|'.join(ADMIN_ROOTS)

    # href="/users/…", router.push('/meetings'), to: '/settings/areas'
    text = re.sub(rf"""(href=|router\.push\(|router\.replace\(|to: )(['"`])/({roots})\b""",
                  r"\1\2/admin/\3", text)
    # the dashboard link
    text = re.sub(r"""(href=|router\.push\(|router\.replace\(|to: )(['"])/\2""",
                  r"\1\2/admin\2", text)
    return text


def to_next(text: str, here: pathlib.Path, root: pathlib.Path) -> str:
    text = re.sub(r"^import \{[^}]*\} from 'react-router-dom';\n", '', text, flags=re.M)

    hooks = []
    if re.search(r'\buseNavigate\b', text):
        hooks.append('useRouter')
    if re.search(r'\buseParams\b', text):
        hooks.append('useParams')
    compat = bool(re.search(r'\buseSearchParams\b', text))

    imports = []
    if re.search(r'<Link\b', text):
        imports.append("import Link from 'next/link';")
    if hooks:
        imports.append(f"import {{ {', '.join(sorted(set(hooks)))} }} from 'next/navigation';")
    if compat:
        imports.append("import { useSearchParams } from '@/client/navigation';")

    text = re.sub(r'(<Link\b[^>]*?)\bto=', r'\1href=', text, flags=re.S)
    text = text.replace('useNavigate()', 'useRouter()')
    text = re.sub(r'\bnavigate\((.+?),\s*\{\s*replace:\s*true\s*\}\)', r'router.replace(\1)', text)
    text = re.sub(r'\bnavigate\(', 'router.push(', text)
    text = re.sub(r'\bconst navigate = useRouter\(\)', 'const router = useRouter()', text)

    text = text.replace("from '@coco/shared'", "from '@/lib'")

    def local(match: re.Match) -> str:
        target = (here.parent / match.group(1)).resolve()
        rel = target.relative_to(root.resolve()).as_posix()
        if rel.startswith('lib/'):
            return "from '@/client/admin-%s'" % rel[4:]
        if rel.startswith('components/'):
            return "from '@/components/admin/%s'" % rel[len('components/'):]
        if rel.startswith('pages/'):
            return "from '@/components/admin/%s'" % rel[len('pages/'):]
        return "from '@/components/admin/%s'" % rel

    text = re.sub(r"from '((?:\./|\.\./)[A-Za-z0-9_/.-]+)\.js'", local, text)
    text = re.sub(r"\.js'", "'", text)

    if imports:
        lines = text.split('\n')
        for index, line in enumerate(lines):
            if line.startswith('import '):
                lines.insert(index, '\n'.join(imports))
                break
        else:
            lines.insert(0, '\n'.join(imports))
        text = '\n'.join(lines)

    if not text.lstrip().startswith("'use client'"):
        text = "'use client';\n\n" + text.lstrip()
    return text


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0

    for source in sorted((SRC / 'pages').glob('*.tsx')):
        target = OUT / source.name
        target.write_text(remount(repaint(to_next(source.read_text(), source, SRC))))
        count += 1

    for source in sorted((SRC / 'components').glob('*.tsx')):
        target = OUT / source.name
        target.write_text(remount(repaint(to_next(source.read_text(), source, SRC))))
        count += 1

    for source in sorted((SRC / 'lib').glob('*.ts')):
        target = pathlib.Path('src/client') / f'admin-{source.name}'
        text = repaint(to_next(source.read_text(), source, SRC))
        target.write_text(text)
        count += 1

    print(f'ported {count} admin files')


if __name__ == '__main__':
    main()
