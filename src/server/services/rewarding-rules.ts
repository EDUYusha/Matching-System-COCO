import { Prisma } from '@prisma/client';
import type { RewardingCategory, RewardingPolicy, RewardingRule } from '@prisma/client';
import { prisma, type Tx } from '@/server/lib/prisma';

/**
 * Port of RewardingRule.for_user and RewardingRule.target_point.
 *
 * The rules relevant to a user are:
 *   1) rules for the user's user_type
 *   2) rules for everyone (user_type IS NULL)
 *   3) rules written specifically for this user
 *   4) minus those in 1) and 2) that a user-specific rule overrides
 *
 * The original expressed that as one CTE; the same SQL runs here (Postgres needs
 * no changes to it beyond parameter binding, which also closes the interpolation
 * the Ruby version did by hand).
 */
export async function rulesForUser(
  user: { id: number; userType: string },
  category: RewardingCategory,
  tx?: Tx,
): Promise<RewardingRule[]> {
  const client = tx ?? prisma;
  return client.$queryRaw<RewardingRule[]>(Prisma.sql`
    WITH category_rules AS (
      SELECT *
        FROM rewarding_rules
        WHERE category = ${category}::"RewardingCategory"
        AND (user_type = ${user.userType} OR user_type IS NULL)
    ),
    user_overrides AS (
      SELECT * FROM category_rules WHERE user_id = ${user.id}
    )
    SELECT *
      FROM category_rules
      WHERE user_id IS NULL
      AND id NOT IN (
        SELECT override_id FROM user_overrides WHERE override_id IS NOT NULL
      )
    UNION ALL
    SELECT * FROM user_overrides
  `);
}

/**
 * RewardingRule.target_point — the invitation rule matching an invitee type and
 * policy, used only to quote the reward amount in the signup messages.
 */
export async function targetRewardingRule(
  user: { id: number; userType: string },
  inviteeUserType: string,
  policy: RewardingPolicy,
  tx?: Tx,
): Promise<RewardingRule | null> {
  const rules = await rulesForUser(user, 'invitation', tx);
  return rules.find((rule) => rule.inviteeUserType === inviteeUserType && rule.policy === policy) ?? null;
}

/**
 * Raw-query rows come back with snake_case keys, because $queryRaw bypasses
 * Prisma's field mapping. This normalises them to the camelCase model shape the
 * rest of the code expects.
 */
export function normaliseRule(row: Record<string, unknown>): RewardingRule {
  if ('userType' in row) return row as unknown as RewardingRule;
  return {
    id: row.id as number,
    category: row.category as RewardingCategory,
    userType: (row.user_type ?? null) as string | null,
    userId: (row.user_id ?? null) as number | null,
    overrideId: (row.override_id ?? null) as number | null,
    policy: row.policy as RewardingPolicy,
    payout: row.payout as number,
    payoutPermille: row.payout_permille as number,
    each: row.each as number,
    limit: (row.limit ?? null) as number | null,
    inviteeUserType: (row.invitee_user_type ?? null) as string | null,
    serviceFeeReset: row.service_fee_reset as number,
    serviceFeeIncrease: row.service_fee_increase as number,
    minStars: row.min_stars as number,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export async function normalisedRulesForUser(
  user: { id: number; userType: string },
  category: RewardingCategory,
  tx?: Tx,
): Promise<RewardingRule[]> {
  const rows = (await rulesForUser(user, category, tx)) as unknown as Array<Record<string, unknown>>;
  return rows.map(normaliseRule);
}
