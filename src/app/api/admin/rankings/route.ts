import { z } from 'zod';
import { requireAdmin } from '@/server/api/admin-scope';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/rankings */
export const GET = route(async (_request, { searchParams }) => {
  await requireAdmin();
  const query = z
    .object({ category: z.string().optional(), period: z.string().optional(), userType: z.string().optional() })
    .parse(queryObject(searchParams));

  const { creditsRanking } = await import('@/server/services/rankings');
  const result = await creditsRanking({
    category: (query.category ?? 'credits') as never,
    period: (query.period ?? 'this_month') as never,
    userType: (query.userType ?? 'cast') as 'cast' | 'customer',
    // operators see everyone, so no viewer-specific row is needed
    viewerId: 0,
    limit: 100,
  });

  return {
    rows: result.rows.map((row) => ({
      position: Number(row.position),
      score: Number(row.score ?? 0),
      userId: row.user_id,
      nickName: row.user_nick_name,
      userType: row.user_type,
      guestTitle: row.user_guest_title,
    })),
  };
});
