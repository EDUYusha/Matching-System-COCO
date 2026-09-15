import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
/**
 * Shared by the financial route handlers: the schemas and query helpers
 * the original financial.ts declared once and used from several actions.
 */

/**
 * The fallback both gateway callbacks use when the session is gone: the single
 * user who started a card registration in the last five minutes. Ambiguous when
 * more than one did, which the original logged and took the newest of.
 */
export async function recentPendingCardUser() {
  const candidates = await prisma.user.findMany({
    where: { creditcardToken: { startsWith: '!' }, updatedAt: { gt: new Date(Date.now() - 5 * 60 * 1000) } },
    orderBy: { updatedAt: 'desc' },
  });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    logger.warn({ count: candidates.length }, 'multiple pending card registrations, picking the newest');
    return candidates[0];
  }
  return null;
}
