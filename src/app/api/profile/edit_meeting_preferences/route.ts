import { prisma } from '@/server/lib/prisma';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** profiles: GET /profile/edit_meeting_preferences */
export const GET = route(async (_request) => {
  const user = await requireUser();
  const [all, mine] = await Promise.all([
    prisma.meetingPreferencesSchema.findMany({
      where: { active: true, castPreference: true },
      orderBy: { sortIndex: 'asc' },
    }),
    prisma.meetingPreference.findMany({ where: { userId: user.id }, select: { parentId: true } }),
  ]);
  const mineIds = new Set(mine.map((preference) => preference.parentId));

  const byCategory: Record<string, Array<{ id: number; name: string | null; subcategory: string | null; selected: boolean }>> =
    {};
  for (const row of all) {
    const key = row.category ?? '';
    byCategory[key] = byCategory[key] ?? [];
    byCategory[key].push({
      id: row.id,
      name: row.name,
      subcategory: row.subcategory,
      selected: mineIds.has(row.id),
    });
  }
  return { preferenceGroups: byCategory };
});
