#!/usr/bin/env python3
"""
The hand-written corrections applied after tools/translate-routes.py.

A handful of handlers do something the translator cannot express: they take the
Fastify `reply` as an argument, or reach for the admin session. They are fixed
here rather than in the generated files so the whole pipeline stays repeatable.
"""

from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent


def edit(rel: str, pairs: list[tuple[str, str]]) -> None:
    """Applies each replacement, skipping any already in place so reruns are safe."""
    path = ROOT / rel
    text = path.read_text()
    for old, new in pairs:
        if old in text:
            text = text.replace(old, new)
        elif new and new in text:
            continue          # already applied
        elif not new and old not in text:
            continue          # already removed
        else:
            raise SystemExit(f'postfix miss in {rel}: {old[:70]!r}')
    path.write_text(text)
    print(f'  {rel}')


def write(rel: str, text: str) -> None:
    (ROOT / rel).write_text(text)
    print(f'  {rel}')


print('postfix:')

# loginPreparations wrote its cookies through the Fastify reply; the Next
# session helpers write them from inside, so the parameter goes away
edit('src/server/api/sessions-shared.ts', [
    ("""export async function loginPreparations(
  reply: FastifyReply,
  user:""", """export async function loginPreparations(
  user:"""),
])
for caller in ('src/app/api/login/route.ts', 'src/app/api/sns_login_return/route.ts'):
    path = ROOT / caller
    path.write_text(re.sub(r'loginPreparations\(\s*reply,\s*', 'loginPreparations(', path.read_text()))
    print(f'  {caller}')

# the admin cookie goes through the admin session helpers
edit('src/app/api/admin/login/route.ts', [
    ("""import { env } from '@/server/config/env';
import { ADMIN_SESSION_COOKIE, signAdminSession, verifyPassword } from '@/server/lib/auth';""",
     """import { verifyPassword } from '@/server/lib/auth';
import { setAdminSession } from '@/server/auth/session';"""),
    ("""  reply.setCookie(ADMIN_SESSION_COOKIE, signAdminSession({ adminId: admin.id }), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    maxAge: 12 * 60 * 60,
  });""", """  await setAdminSession(admin.id);"""),
])

write('src/app/api/admin/logout/route.ts', '''import { clearAdminSession } from '@/server/auth/session';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin: POST /admin/logout */
export const POST = route(async () => {
  await clearAdminSession();
  return { ok: true };
});
''')

write('src/app/api/admin/me/route.ts', '''import { prisma } from '@/server/lib/prisma';
import { currentAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** admin: GET /admin/me */
export const GET = route(async () => {
  const admin = await currentAdmin();
  if (!admin) return { admin: null };

  const businessArea = admin.businessAreaId
    ? await prisma.businessArea.findUnique({ where: { id: admin.businessAreaId } })
    : null;

  return { admin: { ...admin, businessAreaName: businessArea?.name ?? null } };
});
''')

# the reschedule_jobs handler imports a worker it no longer calls directly
edit('src/app/api/internal_api/meetings/[meetingId]/reschedule_jobs/route.ts', [
    ("import { autoOpenMeeting } from '@/server/services/meetings/selection';\n", ''),
])

# multipart: Fastify's part iterator becomes Next's FormData (see http/multipart)
edit('src/app/api/cast/request_agreement/route.ts', [
    ("import { requireUser } from '@/server/auth/session';",
     "import { uploadParts } from '@/server/http/multipart';\nimport { requireUser } from '@/server/auth/session';"),
    ("// pulls in the request.file() / request.files() type augmentation\n", ''),
    ('  const parts = request.files();', '  const parts = await uploadParts(request);'),
    ('  for await (const part of parts) {', '  for (const part of parts) {'),
])

print('done')
