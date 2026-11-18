import { exchangeCredits } from '@/server/services/buy-credits';
import { railsPresence, railsToInt, requestParams } from '@/server/http/params';
import { internalApiRoute, railsBadRequest } from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/financial/credit_exchange
 *
 * Flat parameters, not nested, with `amount`, `cash` and `reflect` through
 * `to_i`. The interactor's failure was rendered as a 400 with its message.
 */
export const POST = internalApiRoute(async (request) => {
  const body = await requestParams(request);

  try {
    await exchangeCredits({
      recipientId: railsToInt(body.user_id),
      amount: railsToInt(body.amount),
      reason: railsPresence(body.reason),
      receivedYen: railsToInt(body.cash),
      reflect: railsToInt(body.reflect),
    });
  } catch (error) {
    // a missing user was `User.find`'s RecordNotFound, which is a 404, not this
    if ((error as { code?: string }).code === 'P2025') throw error;
    throw railsBadRequest((error as Error).message);
  }
});
