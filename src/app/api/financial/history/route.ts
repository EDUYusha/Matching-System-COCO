import { transactionsForCast, transactionsForCustomer } from '@/server/services/transactions-history';
import { requireGate } from '@/server/auth/session';
import { queryObject, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** financial: GET /financial/history */
export const GET = route(async (_request, { searchParams }) => {
  const user = await requireGate('financial_history');
  const page = Number((queryObject(searchParams) as { page?: string }).page) || 1;

  const isGuest =
    user.userType === 'customer' ||
    user.userType === 'inviter' ||
    user.userType === 'operator' ||
    user.userType === 'admin';

  const result = isGuest
    ? await transactionsForCustomer(user.id, page)
    : await transactionsForCast(user.id, page);

  return { ...result, page, creditBalance: user.creditBalance };
});
