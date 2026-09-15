import { prisma } from '@/server/lib/prisma';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/**
 * The active branches.
 *
 * Deliberately unauthenticated. `CastController` ran
 * `skip_before_action :set_current_user, only: [:signup, :new, :create]`, and
 * cast/new.html.erb rendered `BusinessArea.where(active: true)` straight into
 * the form — so an anonymous visitor could always read this list. Gating it
 * leaves the branch picker on the public cast signup empty, which is what
 * happened before this was fixed.
 *
 * Branch names are public reference data; nothing here is per-user.
 */
export const GET = route(async () => {
  const businessAreas = await prisma.businessArea.findMany({
    where: { active: true },
    orderBy: { sortIndex: 'asc' },
  });

  return {
    businessAreas: businessAreas.map((area) => ({ id: area.id, name: area.name, color: area.color })),
  };
});
