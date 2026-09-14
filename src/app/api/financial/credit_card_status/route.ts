import { logger } from '@/server/lib/logger';
import { hasValidCreditCard } from '@/server/services/users';
import { currentUser } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
import { recentPendingCardUser } from '@/server/api/financial-shared';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/credit_card_status */
export const GET = route(async (_request, { searchParams }) => {
  let user = (await currentUser());

  if (!user) {
    // the session may have expired inside the issuer's iframe
    const md = (queryObject(searchParams) as { md?: string }).md;
    logger.warn({ md }, 'credit_card_status: no session');
    user = await recentPendingCardUser();
    if (!user) return { status: 'unknown' };
  }

  return { status: hasValidCreditCard(user) ? 'valid' : 'invalid' };
});
