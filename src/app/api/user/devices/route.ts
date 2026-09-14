import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: POST /user/devices */
export const POST = route(async (request) => {
  const user = await requireUser();
  const body = z.object({ device_id: z.string().min(1) }).parse(await jsonBody(request));

  const devices = Array.isArray(user.deviceIds) ? (user.deviceIds as string[]) : [];
  const next = [...new Set([...devices, body.device_id])];
  await prisma.user.update({ where: { id: user.id }, data: { deviceIds: next } });
  return NextResponse.json({ ok: true }, { status: 200 });
});
