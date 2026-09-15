import { NextResponse } from 'next/server';
import { z } from 'zod';
import { likePost } from '@/server/services/posts';
import { requireGate } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** posts: PUT /posts/:id/like */
export const PUT = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireGate('post');
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const ok = await likePost(params.id, user.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 403 });
});
