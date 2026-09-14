import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unlikePost } from '@/server/services/posts';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: PUT /posts/:id/unlike */
export const PUT = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('post');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  // cast cannot un-like: they have already been credited for it
  if (user.userType === 'cast') return NextResponse.json({ ok: false }, { status: 200 });
  const ok = await unlikePost(params.id, user.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 403 });
});
