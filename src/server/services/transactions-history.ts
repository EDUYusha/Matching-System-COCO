import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { takeWithOverflow } from '@/server/lib/pagination';
import { toTransactionRow, type TransactionRowRaw } from '@/server/lib/serializers';

/**
 * Port of CreditTransaction.for_customer and .for_cast.
 *
 * Both fetch one row more than the page size so the caller knows whether to show
 * a "next" link without a COUNT — the original returned `[transactions, _next]`.
 *
 * The guest view collapses an order's many per-cast rows into a single line
 * (that is what the UNION's second branch does), because a guest thinks in orders
 * while a cast thinks in individual payouts. Two MySQL-isms needed translating:
 * `IF()` became `CASE WHEN`, and the loose `GROUP BY cast_attendances.meeting_id`
 * became an explicit aggregate over the columns MySQL was picking arbitrarily.
 */

export async function transactionsForCustomer(userId: number, page = 1, per = 10) {
  const rows = await prisma.$queryRaw<TransactionRowRaw[]>(Prisma.sql`
    SELECT * FROM (
      SELECT CASE WHEN charged_user_id = ${userId} THEN 0 - charged_amount ELSE credited_amount END AS total,
             credit_transactions.created_at,
             credit_transactions.category::text AS category,
             NULL::int AS meeting_id,
             stickers.id AS sticker_id,
             credit_conversions.id AS credit_conversion_id,
             credit_conversions.inverse_conversion_id AS inverse_conversion_id,
             NULL::text AS flow_direction
      FROM credit_transactions
      LEFT JOIN stickers ON stickers.credit_transaction_id = credit_transactions.id
      LEFT JOIN credit_conversions ON credit_conversions.credit_transaction_id = credit_transactions.id
      WHERE credit_transactions.category != 'meeting'::"CreditTransactionCategory"
        AND (credited_user_id = ${userId} OR charged_user_id = ${userId})
      UNION ALL
      SELECT 0 - COALESCE(SUM(cts.charged_amount), 0) + MIN(meetings.final_discount) AS total,
             MAX(cts.created_at) AS created_at,
             'meeting'::text AS category,
             cast_attendances.meeting_id AS meeting_id,
             NULL::int AS sticker_id,
             NULL::int AS credit_conversion_id,
             NULL::int AS inverse_conversion_id,
             NULL::text AS flow_direction
      FROM credit_transactions AS cts
      INNER JOIN cast_attendances ON cast_attendances.credit_transaction_id = cts.id
      INNER JOIN meetings ON cast_attendances.meeting_id = meetings.id
      WHERE cts.category = 'meeting'::"CreditTransactionCategory"
        AND (cts.credited_user_id = ${userId} OR cts.charged_user_id = ${userId})
      GROUP BY cast_attendances.meeting_id
    ) AS combined
    ORDER BY created_at DESC
    LIMIT ${per + 1} OFFSET ${(page - 1) * per}
  `);

  const { items, overflow } = takeWithOverflow(rows, per);
  return { transactions: items.map(toTransactionRow), hasMore: !!overflow };
}

export async function transactionsForCast(userId: number, page = 1, per = 10) {
  const rows = await prisma.$queryRaw<TransactionRowRaw[]>(Prisma.sql`
    SELECT CASE WHEN charged_user_id = ${userId} THEN 0 - charged_amount ELSE credited_amount END AS total,
           credit_transactions.created_at,
           credit_transactions.category::text AS category,
           cast_attendances.meeting_id AS meeting_id,
           stickers.id AS sticker_id,
           credit_conversions.id AS credit_conversion_id,
           credit_conversions.inverse_conversion_id AS inverse_conversion_id,
           credit_conversions.flow_direction::text AS flow_direction
    FROM credit_transactions
    LEFT JOIN stickers ON stickers.credit_transaction_id = credit_transactions.id
    LEFT JOIN credit_conversions ON credit_conversions.credit_transaction_id = credit_transactions.id
    LEFT JOIN cast_attendances ON cast_attendances.credit_transaction_id = credit_transactions.id
    WHERE credited_user_id = ${userId} OR charged_user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${per + 1} OFFSET ${(page - 1) * per}
  `);

  const { items, overflow } = takeWithOverflow(rows, per);
  return { transactions: items.map(toTransactionRow), hasMore: !!overflow };
}
