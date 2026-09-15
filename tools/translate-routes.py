#!/usr/bin/env python3
"""
Translates the Fastify route files from coco-v2 into Next.js Route Handlers.

The route files are thin: they parse input, call a service, and shape a
response. The services were ported verbatim, so what is left is a mechanical
substitution of the request/reply API. Doing it by hand across ~190 endpoints
would invite typos in exactly the places a typo is expensive, so it is done
here and the result is typechecked and exercised.

Anything this cannot express (multipart uploads, streamed PDFs, the ones that
reach for raw headers) is reported at the end and finished by hand.
"""

from __future__ import annotations

import pathlib
import re
import sys
from collections import defaultdict

SRC = pathlib.Path('../coco-v2/apps/api/src/routes')
OUT = pathlib.Path('src/app/api')

METHODS = ('get', 'post', 'put', 'patch', 'delete')

# declarations lifted out of each source file, by source stem
SHARED: dict[str, set[str]] = {}

ROUTE_RE = re.compile(
    r"^(?P<indent>\s*)app\.(?P<method>" + '|'.join(METHODS) + r")\(\s*"
    r"(?P<quote>['\"])(?P<path>[^'\"]+)(?P=quote)\s*,\s*"
    r"async\s*\((?P<args>[^)]*)\)\s*"
    r"(?::\s*(?P<ret>[^=]+?))?\s*=>\s*\{",
    re.M,
)


def find_block(text: str, start: int) -> tuple[str, int]:
    """
    Returns the body between the handler's braces and the index after it.

    Brace counting alone is not enough: the handlers contain Japanese strings
    with braces, regexes, `//` and `/* */` comments, and template literals whose
    `${...}` interpolations nest arbitrarily. Each of those is skipped here.
    """
    depth = 1
    i = start
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ''

        if ch == '/' and nxt == '/':
            i = text.find('\n', i)
            if i == -1:
                break
            continue

        if ch == '/' and nxt == '*':
            end = text.find('*/', i + 2)
            i = len(text) if end == -1 else end + 2
            continue

        if ch in '\'"':
            quote = ch
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
            i += 1
            continue

        if ch == '`':
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == '`':
                    break
                if text[i] == '$' and text[i + 1 : i + 2] == '{':
                    # walk the interpolation with its own brace counter
                    inner = 1
                    i += 2
                    while i < len(text) and inner:
                        if text[i] == '{':
                            inner += 1
                        elif text[i] == '}':
                            inner -= 1
                        elif text[i] in '\'"`':
                            quote = text[i]
                            i += 1
                            while i < len(text) and text[i] != quote:
                                i += 2 if text[i] == '\\' else 1
                        i += 1
                    continue
                i += 1
            i += 1
            continue

        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
        i += 1

    raise ValueError('unbalanced handler')



DECL_RE = re.compile(
    r'^(?P<indent>\s*)(?:export\s+)?(?P<kind>const|let|function|async function|type|interface|enum)\s+'
    r'(?P<name>[A-Za-z_$][\w$]*)',
)


def collect_shared(text: str) -> tuple[list[str], set[str]]:
    """
    Returns the declarations a route file shares with its siblings.

    The Fastify files declare schemas and query-building helpers in two places:
    module scope (between the imports and `export async function`) and inside
    the route closure alongside the handlers. Both are used by several handlers,
    so both move into one module per resource rather than being copied into
    every generated file.
    """
    blocks: list[str] = []
    names: set[str] = set()

    # module scope: everything between the last import and the route function
    entry = text.index('export async function')
    module_scope = text[:entry]
    last_import = 0
    for m in re.finditer(r"^import .*?;\s*$", module_scope, re.M | re.S):
        last_import = m.end()
    preamble = module_scope[last_import:]

    # closure scope: statements inside the route function that are not handlers
    body_start = text.index('{', entry) + 1
    closure, closure_end = find_block(text, body_start)

    # and several files put their query helpers *after* the route function
    epilogue = text[closure_end:]

    for region, indent in ((preamble, 0), (closure, 2), (epilogue, 0)):
        i = 0
        lines = region.split('\n')
        while i < len(lines):
            line = lines[i]
            match = DECL_RE.match(line)
            declared_indent = len(line) - len(line.lstrip(' '))
            if not match or declared_indent != indent or line.lstrip().startswith('app.'):
                i += 1
                continue

            # take the statement whole, by balancing its braces/parens
            start = sum(len(l) + 1 for l in lines[:i])
            chunk_end = _statement_end(region, start)
            chunk = region[start:chunk_end]

            # keep the doc comment that precedes it
            lead = []
            j = i - 1
            while j >= 0 and (lines[j].strip().startswith(('*', '/*', '//')) or not lines[j].strip()):
                if not lines[j].strip() and lead:
                    break
                lead.insert(0, lines[j])
                j -= 1
            while lead and not lead[0].strip():
                lead.pop(0)

            blocks.append('\n'.join(l[indent:] if l[:indent].isspace() or not l[:indent] else l
                                     for l in (lead + chunk.split('\n'))))
            names.add(match.group('name'))
            i += chunk.count('\n') + 1
    return blocks, names


def _statement_end(text: str, start: int) -> int:
    """End index of the statement beginning at `start` (braces and parens balanced)."""
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch in '\'"`':
            quote = ch
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
        elif ch == '/' and text[i + 1 : i + 2] == '/':
            i = text.find('\n', i)
            if i == -1:
                return len(text)
            continue
        elif ch == '/' and text[i + 1 : i + 2] == '*':
            i = text.find('*/', i) + 1
        elif ch in '{([':
            depth += 1
        elif ch in '})]':
            depth -= 1
        elif ch == '\n' and depth == 0 and i > start:
            prev = text[start:i].rstrip()
            if prev.endswith((';', '}')):
                return i
        i += 1
    return len(text)


def dedent(block: str) -> str:
    lines = block.split('\n')
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ''
    widths = [len(l) - len(l.lstrip(' ')) for l in lines if l.strip()]
    cut = min(widths) if widths else 0
    return '\n'.join(l[cut:] if l.strip() else '' for l in lines)


def transform(body: str) -> tuple[str, set[str], set[str]]:
    """Rewrites the Fastify request/reply API. Returns (body, imports, flags)."""
    needs: set[str] = set()
    flags: set[str] = set()

    # --- auth helpers -------------------------------------------------------
    def auth(match: re.Match) -> str:
        needs.add(match.group(1))
        rest = match.group(2).strip()
        rest = re.sub(r'^request\s*,?\s*', '', rest)
        return f'await {match.group(1)}({rest})'

    body = re.sub(r'app\.(requireUser|requirePermission|requireGate)\(([^;]*?)\)(?=[;\s),.])', auth, body)

    # admin.ts's local helper, now an import
    body = re.sub(r'(?<!await )requireAdmin\(request\)', 'await requireAdmin()', body)

    if 'request.currentUser' in body:
        needs.add('currentUser')
        # `const x = request.currentUser` and inline uses both work as an await
        body = body.replace('request.currentUser', '(await currentUser())')

    # dynamic imports inside a handler body get the same rewrite as the head
    body = re.sub(r"await import\('\.\./(lib|config|services|workers|realtime|mail)/([^']+?)(?:\.js)?'\)",
                  lambda m: "await import('@/server/%s/%s')" % (
                      'jobs' if m.group(1) == 'workers' else m.group(1), m.group(2)),
                  body)
    body = re.sub(r"await import\('\./([^']+?)(?:\.js)?'\)", r"await import('@/server/services/\1')", body)
    body = body.replace("await import('@coco/shared')", "await import('@/lib')")

    # --- input --------------------------------------------------------------
    if 'request.session' in body:
        needs.add('readSession')
        body = body.replace('request.session', '(await readSession())')

    if 'request.body' in body:
        needs.add('jsonBody')
        body = body.replace('request.body', 'await jsonBody(request)')
    if 'request.query' in body:
        needs.add('queryObject')
        body = body.replace('request.query', 'queryObject(searchParams)')
    body = body.replace('request.params', 'routeParams')

    if 'request.headers' in body:
        body = re.sub(r"request\.headers\.([a-zA-Z_][\w]*)",
                      lambda m: f"request.headers.get('{camel_to_header(m.group(1))}')", body)
        body = re.sub(r"request\.headers\[(['\"])([^'\"]+)\1\]",
                      lambda m: f"request.headers.get('{m.group(2)}')", body)
    if 'request.ip' in body:
        needs.add('clientIp')
        body = body.replace('request.ip', 'clientIp(request)')
    if 'request.file(' in body or 'request.parts(' in body or 'request.isMultipart' in body:
        flags.add('multipart')

    # --- reply --------------------------------------------------------------
    if 'reply.' in body:
        needs.add('NextResponse')

    # `reply.status(n).send()` with no body is a bare status — it must NOT become
    # `NextResponse.json()`, which would drop the status and send 200
    # the status can be an expression (`ok ? 200 : 403`) and the chain is often
    # split across lines, so both are matched loosely
    chain = r'return reply\s*\.\s*status\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\.\s*send\('
    body = re.sub(chain + r'\s*\);',
                  lambda m: f'return new NextResponse(null, {{ status: {m.group(1).strip()} }});',
                  body, flags=re.S)
    body = re.sub(chain + r'(.+?)\);',
                  lambda m: f'return NextResponse.json({m.group(2).strip()}, {{ status: {m.group(1).strip()} }});',
                  body, flags=re.S)
    body = re.sub(r'return reply\.send\(\s*\);', 'return new NextResponse(null, { status: 200 });', body)
    body = re.sub(r'return reply\.send\((.+?)\);', r'return NextResponse.json(\1);', body, flags=re.S)
    body = re.sub(r'reply\.setSession\(', 'await setSession(', body)
    body = re.sub(r'reply\.clearSession\(\)', 'await clearSession()', body)
    body = re.sub(r'reply\.setRememberToken\(', 'await setRememberToken(', body)
    for helper in ('setSession', 'clearSession', 'setRememberToken'):
        if f'await {helper}(' in body:
            needs.add(helper)

    if re.search(r'reply\.(header|type|send|redirect|raw)', body):
        flags.add('reply')

    return body, needs, flags


def camel_to_header(name: str) -> str:
    return re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', name).lower()


def next_path(route_path: str) -> pathlib.Path:
    parts = []
    for segment in route_path.strip('/').split('/'):
        if segment.startswith(':'):
            parts.append(f'[{segment[1:]}]')
        else:
            parts.append(segment)
    return OUT.joinpath(*parts)


def param_names(route_path: str) -> list[str]:
    return [s[1:] for s in route_path.strip('/').split('/') if s.startswith(':')]


def main() -> None:
    only = sys.argv[1:] or None
    grouped: dict[pathlib.Path, list[dict]] = defaultdict(list)
    file_imports: dict[pathlib.Path, str] = {}
    manual: list[str] = []

    for source in sorted(SRC.glob('*.ts')):
        if only and source.stem not in only:
            continue
        text = source.read_text()

        # the import block at the top of the file, rewritten for the new layout
        entry = text.index('export async function')
        last_import = 0
        for m in re.finditer(r"^import .*?;\s*$", text[:entry], re.M | re.S):
            last_import = m.end()
        head = text[:last_import]
        head = (head
                .replace("from '@coco/shared'", "from '@/lib'")
                .replace("from '../lib/", "from '@/server/lib/")
                .replace("from '../config/", "from '@/server/config/")
                .replace("from '../services/", "from '@/server/services/")
                .replace("from '../workers/", "from '@/server/jobs/")
                .replace("from '../realtime/", "from '@/server/realtime/")
                .replace("from '../mail/", "from '@/server/mail/")
                .replace("from '../plugins/auth.js'", "from '@/server/auth/session'"))
        head = re.sub(r"\.js'", "'", head)
        head = head.replace("from './users'", "from '@/server/api/users-shared'")

        # `declare module 'fastify' { … }` has no place in a Next handler; drop
        # the whole block, not just the lines that mention fastify
        head = re.sub(r"declare module '[^']+' \{.*?\n\}\n", '', head, flags=re.S)
        head = '\n'.join(l for l in head.split('\n') if 'fastify' not in l.lower())

        # admin.ts defines these two inside the route closure; they move to a
        # module both the handlers and the pages can import
        if source.stem == 'admin':
            head += "\nimport { branchScope, requireAdmin } from '@/server/api/admin-scope';\n"
            head = head.replace(
                "import { ADMIN_SESSION_COOKIE,", "import {").replace(
                "  verifyAdminSession,\n", "")

        shared_blocks, shared_names = collect_shared(text)
        if shared_blocks:
            shared_dir = pathlib.Path('src/server/api')
            shared_dir.mkdir(parents=True, exist_ok=True)
            exported = []
            for block in shared_blocks:
                if source.stem == 'admin' and re.search(r'function (requireAdmin|branchScope)\b', block):
                    continue
                block = transform(block)[0]
                if not re.match(r'\s*(export|/)', block):
                    block = 'export ' + block.lstrip()
                elif block.lstrip().startswith('/'):
                    # keep the doc comment, export the declaration under it —
                    # only at column 0, never a declaration nested in a body
                    lines = block.split('\n')
                    for idx, line in enumerate(lines):
                        if line.startswith(('/', ' ', '*')) or not line.strip():
                            continue
                        if DECL_RE.match(line) and not line.startswith('export'):
                            lines[idx] = 'export ' + line
                        break
                    block = '\n'.join(lines)
                exported.append(block)
            joined_blocks = '\n\n'.join(exported)
            extra: list[str] = []
            auth_used = sorted({n for n in ('requireUser', 'requirePermission', 'requireGate', 'currentUser',
                                            'setSession', 'clearSession', 'setRememberToken', 'requiredAction',
                                            'newRememberToken', 'readSession')
                                if re.search(rf'\b{n}\b', joined_blocks)}
                               - set(re.findall(r'\b(\w+)\b', head)))
            if auth_used:
                extra.append(f"import {{ {', '.join(auth_used)} }} from '@/server/auth/session';")
            if 'NextResponse' in joined_blocks and 'NextResponse' not in head:
                extra.insert(0, "import { NextResponse } from 'next/server';")
            head = head.rstrip() + ('\n' + '\n'.join(extra) if extra else '')

            banner = (f"/**\n * Shared by the {source.stem} route handlers: the schemas and query helpers\n"
                      f" * the original {source.stem}.ts declared once and used from several actions.\n */\n")
            (shared_dir / f'{source.stem}-shared.ts').write_text(
                head.rstrip() + '\n\n' + banner + '\n' + joined_blocks + '\n')
            SHARED[source.stem] = shared_names

        for match in ROUTE_RE.finditer(text):
            block, _ = find_block(text, match.end())
            handler, needs, flags = transform(dedent(block))
            path = match.group('path')
            target = next_path(path)

            if flags:
                manual.append(f"{source.stem}: {match.group('method').upper()} {path} ({', '.join(sorted(flags))})")
                continue

            grouped[target].append({
                'method': match.group('method').upper(),
                'path': path,
                'handler': handler,
                'needs': needs,
                'params': param_names(path),
                'ret': (match.group('ret') or '').strip(),
                'source': source.stem,
            })
            file_imports[target] = head

    written = 0
    for target, routes in sorted(grouped.items()):
        target.mkdir(parents=True, exist_ok=True)
        needs = set().union(*[r['needs'] for r in routes])
        params = routes[0]['params']

        lines = []
        if 'NextResponse' in needs:
            lines.append("import { NextResponse } from 'next/server';")
        lines.append(file_imports[target].strip())

        auth_names = sorted(needs & {'requireUser', 'requirePermission', 'requireGate',
                                     'currentUser', 'setSession', 'clearSession', 'setRememberToken',
                                     'readSession'})
        if auth_names:
            lines.append(f"import {{ {', '.join(auth_names)} }} from '@/server/auth/session';")

        http = ['route']
        for helper in ('jsonBody', 'queryObject', 'clientIp'):
            if helper in needs:
                http.append(helper)
        lines.append(f"import {{ {', '.join(sorted(http))} }} from '@/server/http/route';")

        stem = routes[0]['source']
        wanted = sorted(
            name for name in SHARED.get(stem, set())
            if any(re.search(rf'\b{re.escape(name)}\b', r['handler']) for r in routes)
        )
        if wanted:
            joined = ', '.join(wanted)
            statement = f"import {{ {joined} }} from '@/server/api/{stem}-shared';"
            if len(statement) > 110:
                statement = "import {\n  " + ',\n  '.join(wanted) + f"\n}} from '@/server/api/{stem}-shared';"
            lines.append(statement)

        lines.append('')
        lines.append("export const dynamic = 'force-dynamic';")
        lines.append('')

        generic = ''
        if params:
            generic = '<{ ' + '; '.join(f'{p}: string' for p in params) + ' }>'

        for entry in routes:
            uses_request = re.search(r'\brequest\b', entry['handler'])
            uses_params = bool(entry['params']) and re.search(r'\brouteParams\b', entry['handler'])
            uses_search = 'searchParams' in entry['handler']

            args = []
            args.append('request' if uses_request else '_request')
            ctx = []
            if uses_params:
                ctx.append('params: routeParams')
            if uses_search:
                ctx.append('searchParams')
            if ctx:
                args.append('{ ' + ', '.join(ctx) + ' }')

            ret = f': Promise<{entry["ret"]}>' if entry['ret'] else ''
            lines.append(f"/** {entry['source']}: {entry['method']} {entry['path']} */")
            lines.append(f"export const {entry['method']} = route{generic}(async ({', '.join(args)}){ret} => {{")
            lines.append('\n'.join('  ' + l if l.strip() else '' for l in entry['handler'].split('\n')))
            lines.append('});')
            lines.append('')

        (target / 'route.ts').write_text('\n'.join(lines).rstrip() + '\n')
        written += 1

    print(f'wrote {written} route files covering {sum(len(v) for v in grouped.values())} endpoints')
    if manual:
        print(f'\nleft for hand-porting ({len(manual)}):')
        for entry in manual:
            print(f'  {entry}')


if __name__ == '__main__':
    main()
