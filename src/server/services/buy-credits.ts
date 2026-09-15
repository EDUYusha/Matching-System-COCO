import { ceilTo1000, config, idiv, type CreditTransactionCategory, type FlowDirection } from '@/lib';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { createCreditConversion, createCreditTransaction } from '@/server/services/credits';
import { executeCreditCardChargeback, executeCreditCardTransaction } from '@/server/services/payment-gateway';
import { randomUUID } from 'node:crypto';

/**
 * Ports BuyCredits, BuyCredits3d, ExchangeCredits and RevertPayment — the four
 * places where yen and credits meet.
 *
 * Every one of them writes the CreditTransaction and the CreditConversion inside
 * one database transaction, and logs at fatal level if that write fails after the
 * gateway already took the money, because at that point the two systems have
 * diverged and a human has to reconcile.
 */

export interface BuyCreditsInput {
  userId: number;
  /** credits wanted; rounded up to a multiple of 1000 unless noRounding */
  amount: number;
  forMoney?: number | null;
  noRounding?: boolean;
  reason?: string | null;
  category?: CreditTransactionCategory;
  simulateMoneyFlow?: boolean;
  note?: string | null;
  flowDirection?: FlowDirection;
}

export interface BuyCreditsResult {
  creditTransactionId: number;
  creditConversionId: number;
  receivedYen: number;
  newCredits: number;
}

/** BuyCredits — charges the stored card, then records the conversion. */
export async function buyCredits(input: BuyCreditsInput, tx?: Tx): Promise<BuyCreditsResult> {
  const user = await (tx ?? prisma).user.findUnique({
    where: { id: input.userId },
    select: { id: true, nickName: true, creditcardToken: true },
  });
  if (!user) throw new AppError('No valid user');
  if (!user.creditcardToken) throw new AppError('User has no registered credit card');

  let credits = input.amount;
  if (!credits || credits <= 0) throw new AppError('No valid credit amount');
  if (!input.noRounding) credits = ceilTo1000(credits);

  let chargeAmount: number;
  if (input.forMoney !== undefined && input.forMoney !== null) {
    if (input.forMoney <= 0) throw new AppError('No valid yen amount');
    chargeAmount = input.forMoney;
  } else {
    chargeAmount = idiv(credits * config.thousand_points_in_yen, 1000);
  }

  let conversionCode: string;
  if (input.simulateMoneyFlow) {
    conversionCode = `TEST${randomUUID()}`;
  } else {
    const charge = await executeCreditCardTransaction({
      creditcardToken: user.creditcardToken,
      amount: chargeAmount,
      description: `Credit Charge for ${user.nickName}`,
      userId: user.id,
      note: input.note ?? null,
    });
    conversionCode = charge.conversionCode;
  }

  // The gateway does not confirm the amount synchronously, so we record what we
  // asked for; the asynchronous callback reconciles it.
  const receivedYen = chargeAmount;
  const newCredits = credits;
  const reason = input.reason ?? `ポイントチャージ ユーザー ${user.id}`;
  const category = input.category ?? 'charge';
  const flow = input.flowDirection ?? 'in';

  try {
    return await transaction(tx, async (t) => {
      const ct = await createCreditTransaction(
        {
          creditedUserId: user.id,
          creditedAmount: newCredits,
          category,
          reason,
          withBalanceUpdates: true,
        },
        t,
      );
      const cc = await createCreditConversion(
        {
          creditTransactionId: ct.id,
          userId: user.id,
          amount: receivedYen,
          currency: 'jpy',
          credits: newCredits,
          flowDirection: flow,
          checked: true,
          code: conversionCode,
        },
        t,
      );
      return { creditTransactionId: ct.id, creditConversionId: cc.id, receivedYen, newCredits };
    });
  } catch (error) {
    logger.fatal(
      { error, userId: user.id, token: user.creditcardToken, at: new Date().toISOString() },
      'Successful real transaction was not recorded in the database. Check the axes account for this sendid.',
    );
    throw error;
  }
}

export interface BuyCredits3dInput {
  userId: number;
  conversionCode: string | null;
  /** yen actually authorised by the 3DS flow */
  chargeAmount: number;
  credits: number;
  category?: CreditTransactionCategory;
  reason?: string | null;
  flowDirection?: FlowDirection;
}

/**
 * BuyCredits3d — the 3-D Secure variant. The money has already moved by the time
 * this runs (the gateway captured during `payment3ds`), so this only books it.
 */
export async function buyCredits3d(input: BuyCredits3dInput, tx?: Tx): Promise<BuyCreditsResult> {
  const reason = input.reason ?? `ポイントチャージ ユーザー ${input.userId}`;
  const category = input.category ?? 'charge';
  const flow = input.flowDirection ?? 'in';

  try {
    return await transaction(tx, async (t) => {
      const ct = await createCreditTransaction(
        {
          creditedUserId: input.userId,
          creditedAmount: input.credits,
          category,
          reason,
          withBalanceUpdates: true,
        },
        t,
      );
      const cc = await createCreditConversion(
        {
          creditTransactionId: ct.id,
          userId: input.userId,
          amount: input.chargeAmount,
          currency: 'jpy',
          credits: input.credits,
          flowDirection: flow,
          checked: true,
          code: input.conversionCode ?? null,
        },
        t,
      );
      return {
        creditTransactionId: ct.id,
        creditConversionId: cc.id,
        receivedYen: input.chargeAmount,
        newCredits: input.credits,
      };
    });
  } catch (error) {
    logger.fatal(
      { error, userId: input.userId, at: new Date().toISOString() },
      'Successful 3DS transaction was not recorded in the database.',
    );
    throw error;
  }
}

/**
 * ExchangeCredits — operators granting or removing credits by hand, optionally
 * against cash received. `reflect` picks the category so the admin can decide
 * whether the grant shows up in the turnover rankings.
 */
export async function exchangeCredits(
  input: { recipientId: number; amount: number; reason?: string | null; receivedYen?: number; reflect?: number },
  tx?: Tx,
): Promise<BuyCreditsResult> {
  const { recipientId, amount } = input;
  const reason = input.reason?.trim() || '管理者による手動ポイント付与';
  const cash = input.receivedYen ?? 0;
  const category: CreditTransactionCategory = input.reflect === 1 ? 'manual_reflect' : 'manual';

  if (!Number.isInteger(amount) || amount === 0) throw new AppError('Amount must be a number and not zero');

  return transaction(tx, async (t) => {
    const ct = await createCreditTransaction(
      amount > 0
        ? { creditedUserId: recipientId, creditedAmount: amount, category, reason, withBalanceUpdates: true }
        : { chargedUserId: recipientId, chargedAmount: -amount, category, reason, withBalanceUpdates: true },
      t,
    );
    const cc = await createCreditConversion(
      {
        creditTransactionId: ct.id,
        userId: recipientId,
        amount: cash,
        currency: 'jpy',
        credits: amount,
        flowDirection: amount > 0 ? 'in' : 'out',
        checked: true,
      },
      t,
    );
    return { creditTransactionId: ct.id, creditConversionId: cc.id, receivedYen: cash, newCredits: amount };
  });
}

/**
 * RevertPayment — charges back an incoming conversion and books the mirror rows,
 * linking the two conversions to each other.
 */
export async function revertPayment(
  input: { creditConversionId: number; reason: string },
  tx?: Tx,
): Promise<{ creditTransactionId: number; creditConversionId: number }> {
  const conversion = await (tx ?? prisma).creditConversion.findUnique({
    where: { id: input.creditConversionId },
    include: { user: { select: { creditcardToken: true } } },
  });
  if (!conversion) throw new AppError('Credit conversion not found');
  if (conversion.flowDirection !== 'in') throw new AppError("Can't revert outgoing transactions");

  await executeCreditCardChargeback({
    code: conversion.code,
    creditcardToken: conversion.user.creditcardToken,
  });

  try {
    return await transaction(tx, async (t) => {
      const ct = await createCreditTransaction(
        {
          chargedUserId: conversion.userId,
          chargedAmount: conversion.credits ?? 0,
          category: 'chargeback',
          reason: input.reason,
          withBalanceUpdates: true,
        },
        t,
      );
      const cc = await createCreditConversion(
        {
          creditTransactionId: ct.id,
          userId: conversion.userId,
          amount: -conversion.amount,
          currency: conversion.currency,
          credits: -(conversion.credits ?? 0),
          flowDirection: 'out',
          checked: false,
          inverseConversionId: conversion.id,
        },
        t,
      );
      await t.creditConversion.update({
        where: { id: conversion.id },
        data: { inverseConversionId: cc.id },
      });
      return { creditTransactionId: ct.id, creditConversionId: cc.id };
    });
  } catch (error) {
    logger.fatal(
      { error, conversionId: conversion.id, at: new Date().toISOString() },
      'Successful real chargeback was not recorded in the database.',
    );
    throw error;
  }
}

/** FinancialController#make_charge — validates the step and computes the price. */
export function chargeStepFor(wantedCredits: number): { credits: number; bonus: number; yen: number; total: number } {
  const index = config.charge_steps.indexOf(wantedCredits as never);
  if (index === -1) throw new AppError('invalid credit amount');
  const bonus = config.charge_steps_boni[index];
  const yen = idiv(wantedCredits * config.thousand_points_in_yen, 1000);
  // the guest is charged the displayed yen price; the bonus is free credits on top
  return { credits: wantedCredits, bonus, yen, total: ceilTo1000(wantedCredits + bonus) };
}

export function allChargeSteps(): Array<{ credits: number; bonus: number; yen: number; total: number }> {
  return config.charge_steps.map((credits, index) => ({
    credits,
    bonus: config.charge_steps_boni[index],
    yen: idiv(credits * config.thousand_points_in_yen, 1000),
    total: ceilTo1000(credits + config.charge_steps_boni[index]),
  }));
}
