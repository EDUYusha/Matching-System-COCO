import type { CreditTransactionCategory, FlowDirection } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { NotEnoughCreditsError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';

/**
 * The credit ledger: ports CreditTransaction's `with_balance_updates` callbacks,
 * CreditConversion's company-balance bookkeeping, and User's freeze/unfreeze.
 *
 * Balance mutations use `SELECT … FOR UPDATE` followed by an arithmetic UPDATE,
 * which is what `User#with_lock { self.credit_balance += diff; save! }` did.
 * Reading the balance under the lock matters for the freeze path, which has to
 * refuse when the balance is short.
 */

interface LockedBalance {
  id: number;
  credit_balance: number;
  frozen_credits: number;
}

async function lockUser(tx: Tx, userId: number): Promise<LockedBalance> {
  const rows = await tx.$queryRaw<LockedBalance[]>`
    SELECT id, credit_balance, frozen_credits FROM users WHERE id = ${userId} FOR UPDATE
  `;
  const row = rows[0];
  if (!row) throw new NotEnoughCreditsError(`User ${userId} not found while locking balance`);
  return row;
}

/** User#update_credit_balance! — `diff` may be negative. */
export async function updateCreditBalance(userId: number, diff: number, tx?: Tx): Promise<void> {
  if (diff === 0) return;
  await transaction(tx, async (t) => {
    await lockUser(t, userId);
    await t.$executeRaw`UPDATE users SET credit_balance = credit_balance + ${diff} WHERE id = ${userId}`;
  });
}

/**
 * User#freeze_credits! — moves credits from spendable to frozen. Frozen credits
 * are still credits, so the total never changes here; an order reserves the
 * estimated cost up front and settles against it later.
 */
export async function freezeCredits(userId: number, amount: number, tx?: Tx): Promise<void> {
  if (amount <= 0) return;
  await transaction(tx, async (t) => {
    const user = await lockUser(t, userId);
    if (amount > user.credit_balance) {
      throw new NotEnoughCreditsError(`Missing ${amount - user.credit_balance} credits`);
    }
    await t.$executeRaw`
      UPDATE users
      SET credit_balance = credit_balance - ${amount}, frozen_credits = frozen_credits + ${amount}
      WHERE id = ${userId}
    `;
  });
}

/**
 * User#unfreeze_credits! — unfreezing more than is frozen is legal and silently
 * capped, because freezing is treated as optional by the callers.
 */
export async function unfreezeCredits(userId: number, amount: number | null = null, tx?: Tx): Promise<void> {
  await transaction(tx, async (t) => {
    const user = await lockUser(t, userId);
    let toUnfreeze = amount === null ? user.frozen_credits : amount;
    if (toUnfreeze > user.frozen_credits) toUnfreeze = user.frozen_credits;
    if (toUnfreeze <= 0) return;
    await t.$executeRaw`
      UPDATE users
      SET credit_balance = credit_balance + ${toUnfreeze}, frozen_credits = frozen_credits - ${toUnfreeze}
      WHERE id = ${userId}
    `;
  });
}

export interface CreateTransactionInput {
  chargedUserId?: number | null;
  creditedUserId?: number | null;
  chargedAmount?: number | null;
  creditedAmount?: number | null;
  reason?: string | null;
  category: CreditTransactionCategory;
  /** CreditTransaction#with_balance_updates */
  withBalanceUpdates?: boolean;
}

/**
 * CreditTransaction.create!. Validates `at_least_one_user` and, when
 * `withBalanceUpdates` is set, applies the balance deltas in the same
 * transaction as the row — the original wrapped this in `requires_new: true` so
 * the critical part could roll back independently of the surrounding work.
 */
export async function createCreditTransaction(input: CreateTransactionInput, tx?: Tx) {
  if (input.chargedUserId == null && input.creditedUserId == null) {
    throw new Error('a transaction needs at least one user');
  }

  return transaction(tx, async (t) => {
    const created = await t.creditTransaction.create({
      data: {
        chargedUserId: input.chargedUserId ?? null,
        creditedUserId: input.creditedUserId ?? null,
        chargedAmount: input.chargedAmount ?? null,
        creditedAmount: input.creditedAmount ?? null,
        reason: input.reason ?? null,
        category: input.category,
      },
    });

    if (input.withBalanceUpdates) {
      if (input.chargedUserId != null) {
        await updateCreditBalance(input.chargedUserId, -(input.chargedAmount ?? 0), t);
      }
      if (input.creditedUserId != null) {
        await updateCreditBalance(input.creditedUserId, input.creditedAmount ?? 0, t);
      }
    }

    return created;
  });
}

/** CreditTransaction#restore_credit_balances (after_destroy). */
export async function destroyCreditTransaction(id: number, withBalanceUpdates: boolean, tx?: Tx): Promise<void> {
  await transaction(tx, async (t) => {
    const ct = await t.creditTransaction.findUnique({ where: { id } });
    if (!ct) return;
    await t.creditTransaction.delete({ where: { id } });
    if (!withBalanceUpdates) return;
    if (ct.chargedUserId != null) await updateCreditBalance(ct.chargedUserId, ct.chargedAmount ?? 0, t);
    if (ct.creditedUserId != null) await updateCreditBalance(ct.creditedUserId, -(ct.creditedAmount ?? 0), t);
  });
}

export interface CreateConversionInput {
  creditTransactionId: number;
  userId: number;
  /** yen */
  amount: number;
  currency?: string;
  credits: number | null;
  flowDirection: FlowDirection;
  checked?: boolean;
  code?: string | null;
  inverseConversionId?: number | null;
}

/**
 * CreditConversion.create! plus its `after_save :update_company_balance`, which
 * appends a running company cash balance row for every conversion.
 */
export async function createCreditConversion(input: CreateConversionInput, tx?: Tx) {
  return transaction(tx, async (t) => {
    const conversion = await t.creditConversion.create({
      data: {
        creditTransactionId: input.creditTransactionId,
        userId: input.userId,
        amount: input.amount,
        currency: input.currency ?? 'jpy',
        credits: input.credits,
        flowDirection: input.flowDirection,
        checked: input.checked ?? false,
        code: input.code ?? null,
        inverseConversionId: input.inverseConversionId ?? null,
      },
    });

    const lastBalance = await t.companyBalance.findFirst({ orderBy: { createdAt: 'desc' } });
    await t.companyBalance.create({
      data: {
        balance: (lastBalance?.balance ?? 0) + conversion.amount,
        creditConversionId: conversion.id,
      },
    });

    return conversion;
  });
}

/** CompanyBalance.current */
export async function currentCompanyBalance(): Promise<number> {
  const row = await prisma.companyBalance.findFirst({ orderBy: { id: 'desc' } });
  return row?.balance ?? 0;
}

/** CheckCreditBalance — an order may not start while a charge is outstanding. */
export async function assertNoNegativeBalance(userId: number, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const user = await client.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  if ((user?.creditBalance ?? 0) < 0) {
    throw new Error('Cannot start meeting when unsettled purchases are present');
  }
}

/** CreditTransaction.spend_this_quarter */
export async function spendThisQuarter(userId: number, start: Date, end: Date): Promise<number> {
  const result = await prisma.creditTransaction.aggregate({
    where: { chargedUserId: userId, createdAt: { gte: start, lte: end } },
    _sum: { chargedAmount: true },
  });
  return result._sum.chargedAmount ?? 0;
}

/** User#earnings — the cast's share of what the guest paid. */
export function castEarnings(paidPrice: number, serviceFeePermille: number | null): number {
  if (serviceFeePermille === null || serviceFeePermille === undefined) return 0;
  return Math.floor((Math.trunc(paidPrice) * serviceFeePermille) / 1000);
}

export function logLedger(message: string, meta: Record<string, unknown>): void {
  logger.info(meta, message);
}
