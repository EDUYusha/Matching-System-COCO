#!/usr/bin/env python3
"""
Tidies the imports of the generated Route Handlers.

Each generated file inherited the whole import block of the Fastify route file
it came from, most of which it does not use. This lifts every import to the top
of the file, drops the specifiers nothing references, and removes a statement
entirely when nothing survives.

"References" means anywhere in the file outside the import statements —
including the module-level schema constants the original route files declare
between their imports and their handlers. Run after tools/translate-routes.py.
"""

from __future__ import annotations

import pathlib
import re
import sys

IMPORT_RE = re.compile(
    r"^import\s+(?:(?P<type>type)\s+)?"
    r"(?:\{(?P<names>[^}]*)\}|(?P<default>[A-Za-z_$][\w$]*))"
    r"\s+from\s+(?P<q>['\"])(?P<src>[^'\"]+)(?P=q);[ \t]*\n?",
    re.M | re.S,
)


def prune(path: pathlib.Path) -> bool:
    original = path.read_text()

    statements = list(IMPORT_RE.finditer(original))
    if not statements:
        return False

    # the file with every import statement removed — this is what "used" is
    # measured against, so a name referenced only by a module-level schema
    # constant still counts
    code = IMPORT_RE.sub('', original)

    def used(identifier: str) -> bool:
        return re.search(rf'\b{re.escape(identifier)}\b', code) is not None

    seen: set[str] = set()
    kept_statements: list[str] = []

    for match in statements:
        source = match.group('src')

        if match.group('default'):
            name = match.group('default')
            if used(name) and name not in seen:
                seen.add(name)
                kept_statements.append(f"import {name} from '{source}';")
            continue

        kept: list[str] = []
        for raw in (match.group('names') or '').split(','):
            spec = raw.strip()
            if not spec:
                continue
            local = spec.split(' as ')[-1].strip()
            local = re.sub(r'^type\s+', '', local).strip()
            if not used(local) or local in seen:
                continue
            seen.add(local)
            kept.append(spec)

        if not kept:
            continue

        prefix = 'import type ' if match.group('type') else 'import '
        line = f"{prefix}{{ {', '.join(kept)} }} from '{source}';"
        if len(line) > 110:
            line = f"{prefix}{{\n  " + ',\n  '.join(kept) + f"\n}} from '{source}';"
        kept_statements.append(line)

    rebuilt = '\n'.join(kept_statements) + '\n' + code.lstrip('\n')
    rebuilt = re.sub(r'\n{3,}', '\n\n', rebuilt)

    if rebuilt != original:
        path.write_text(rebuilt)
        return True
    return False


def main() -> None:
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'src/app/api')
    touched = sum(1 for p in sorted(root.rglob('*.ts')) if prune(p))
    print(f'tidied imports in {touched} files')


if __name__ == '__main__':
    main()
