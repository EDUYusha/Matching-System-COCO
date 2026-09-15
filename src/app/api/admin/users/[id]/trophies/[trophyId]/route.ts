import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { requireAdmin } from '@/server/api/admin-scope';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

const ALREADY_GRANTED = 'すでに付与済みです。';

/** admin: POST /admin/users/:id/trophies/:trophyId */
export const POST = route<{ id: string; trophyId: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z
    .object({ id: z.coerce.number(), trophyId: z.coerce.number() })
    .parse(routeParams);

  const existing = await prisma.userTrophy.findFirst({
    where: { userId: params.id, trophyId: params.trophyId },
    select: { id: true },
  });
  if (existing) throw new AppError(ALREADY_GRANTED);

  try {
    await prisma.userTrophy.create({ data: { userId: params.id, trophyId: params.trophyId } });
  } catch (error) {
    // a second grant racing the check above hits the unique index
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(ALREADY_GRANTED);
    }
    throw error;
  }
  return { ok: true };
});

/** admin: DELETE /admin/users/:id/trophies/:trophyId */
export const DELETE = route<{ id: string; trophyId: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z
    .object({ id: z.coerce.number(), trophyId: z.coerce.number() })
    .parse(routeParams);
  await prisma.userTrophy.deleteMany({ where: { userId: params.id, trophyId: params.trophyId } });
  return { ok: true };
});
