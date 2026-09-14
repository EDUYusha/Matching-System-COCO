import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** me: DELETE /user/devices/:deviceId */
export const DELETE = route<{ deviceId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ deviceId: z.string() }).parse(routeParams);

  const devices = Array.isArray(user.deviceIds) ? (user.deviceIds as string[]) : [];
  if (!devices.includes(params.deviceId)) return NextResponse.json({ ok: false }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { deviceIds: devices.filter((id) => id !== params.deviceId) },
  });
  return NextResponse.json({ ok: true }, { status: 200 });
});
