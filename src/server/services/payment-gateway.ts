import { create } from 'xmlbuilder2';
import { randomUUID } from 'node:crypto';
import { env, simulateExternalCalls } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { AppError } from '@/server/lib/errors';
import { AN } from '@/lib';

/**
 * Axes Payment gateway client.
 *
 * Ports ExecuteCreditCardTransaction, ExecuteCreditCardChargeback and the three
 * 3-D Secure calls FinancialController built inline with REXML (`enroll`,
 * `authentication`, `payment`). The request shapes, including the placeholder
 * card number and telno the original sent for token-based charges, are kept
 * as-is: the gateway charges against `sendid` (our stored token), not the card
 * fields.
 *
 * Development and staging never reach the gateway. The original keyed that off
 * `Rails.env` plus two magic tokens, which still work:
 *   creditcard_token == "ALWAYS_FAIL"    → the call fails
 *   creditcard_token == "ALWAYS_SUCCEED" → the call succeeds with a TEST- code
 */

export interface CardTransactionResult {
  conversionCode: string;
}

function firstText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? match[1].trim() : null;
}

async function postForm(url: string, form: Record<string, string>): Promise<string> {
  const body = new URLSearchParams(form).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return (await response.text()).trim();
}

async function postXml(url: string, xml: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  });
  return (await response.text()).trim();
}

function gatewayEmail(userId: number | null | undefined): string {
  const email = userId ? `u_${userId}@${AN.Domain}` : `no-reply@${AN.Domain}`;
  return env.isProduction ? email : `test-${email}`;
}

/**
 * ExecuteCreditCardTransaction — charges the stored token for `amount` yen and
 * returns the gateway's order number, which becomes CreditConversion#code.
 */
export async function executeCreditCardTransaction(params: {
  creditcardToken: string | null;
  amount: number | null;
  description?: string;
  userId?: number | null;
  note?: string | null;
}): Promise<CardTransactionResult> {
  const { creditcardToken: token, amount, userId, note } = params;

  if (!token) throw new AppError('no valid credit card token');
  if (amount === null || amount === undefined || amount <= 0) throw new AppError('incorrect amount');

  if (!env.isProduction) {
    if (token === 'ALWAYS_FAIL') throw new AppError('Failed due to creditcard_token setting');
    if (token === 'ALWAYS_SUCCEED' || env.isTest) return { conversionCode: `TEST-${randomUUID()}` };
  }
  if (simulateExternalCalls) {
    logger.info({ amount, userId }, 'payment gateway simulated (non-production environment)');
    return { conversionCode: `TEST-${randomUUID()}` };
  }

  const form: Record<string, string> = {
    clientip: env.payment.clientIp,
    send: 'cardsv',
    cardnumber: '9999999999999992',
    expyy: '00',
    expmm: '00',
    money: String(amount),
    telno: '0000000000',
    email: gatewayEmail(userId),
    sendid: token,
    printord: 'yes',
    pubsec: 'yes',
  };
  if (note) form.sendpoint = `:${note}`.slice(0, 25);

  const responseBody = await postForm(env.payment.processingUrl, form);

  if (!/^Success_order/.test(responseBody)) {
    logger.error({ responseBody }, 'Connection with AxisPayments failed');
    if (responseBody.startsWith('failure_order')) {
      throw new AppError(
        '決済処理に失敗しました。このクレジットカードは利用できません。<br>有効なクレジットカードを設定して頂くか、決済回数によっては不正使用とカード会社が誤解をしている場合（クレジットカード会社側の不正防止のため）もございますので、カード会社にご確認ください。',
      );
    }
    throw new AppError(responseBody);
  }

  const lines = responseBody.split(/[\r\n]+/);
  return { conversionCode: lines[lines.length - 1] };
}

/** ExecuteCreditCardChargeback — reverses a charge by its order number. */
export async function executeCreditCardChargeback(params: {
  code: string | null;
  creditcardToken?: string | null;
}): Promise<void> {
  const { code, creditcardToken } = params;
  if (!code) throw new AppError('No conversion code (オーダーNo) present.');
  if (env.isTest) return;

  if (!env.isProduction) {
    if (creditcardToken === 'ALWAYS_FAIL') throw new AppError('Failed due to creditcard_token setting');
    if (creditcardToken === 'ALWAYS_SUCCEED') return;
  }
  if (simulateExternalCalls) {
    logger.info({ code }, 'chargeback simulated (non-production environment)');
    return;
  }

  const responseBody = await postForm(env.payment.processingUrl, {
    clientip: env.payment.clientIp,
    return: 'yes',
    ordd: code,
  });

  // the API answers with "0 -\nSuccessOK"
  if (!/SuccessOK/.test(responseBody)) {
    logger.error({ responseBody }, 'AxisPayments chargeback failed');
    throw new AppError(responseBody);
  }
}

// --- 3-D Secure ------------------------------------------------------------

interface CardHolder {
  nameOnCard: string | null;
  phone: string | null;
}

function cardHolderElement(request: ReturnType<typeof create>, holder: CardHolder) {
  const cardHolderInfo = request.ele('cardHolderInfo');
  cardHolderInfo.ele('cardholderName').txt(holder.nameOnCard ?? '');
  // mobile numbers are sent as mobilePhone, landlines as homePhone
  const isMobile = /^(090|080|070)/.test(holder.phone ?? '');
  const phoneEl = cardHolderInfo.ele(isMobile ? 'mobilePhone' : 'homePhone');
  phoneEl.ele('cc').txt('392');
  phoneEl.ele('subscriber').txt(holder.phone ?? '');
}

export interface EnrollResult {
  status: string | null;
  xid: string | null;
  iframeUrl: string | null;
  raw: string;
}

/**
 * `secure_link_3d` / `enroll`.
 *
 * Card registration sends amount 0 with a freshly generated sendid (the pending
 * `!`-prefixed token); a point purchase sends the real amount and the user's
 * existing token.
 */
export async function enroll3ds(params: {
  tokenKey: string;
  amount: number;
  sendId: string;
  sendPoint?: string;
  userId: number;
  holder: CardHolder;
}): Promise<EnrollResult> {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const request = doc.ele('request', { service: 'secure_link_3d', action: 'enroll' });

  const auth = request.ele('authentication');
  auth.ele('clientip').txt(env.payment.clientIp);
  auth.ele('key').txt(env.payment.zkey);

  request.ele('token_key').txt(params.tokenKey);

  const payment = request.ele('payment');
  payment.ele('amount').txt(String(params.amount));
  payment.ele('count').txt('01');

  const user = request.ele('user');
  user.ele('telno', { validation: 'strict' }).txt('01234567890');
  user.ele('email', { language: 'japanese' }).txt(`u_${params.userId}@${AN.Domain}`);

  const uniq = request.ele('uniq_key');
  uniq.ele('sendid').txt(params.sendId);
  uniq.ele('sendpoint').txt(params.sendPoint ?? 'registercard');

  request.ele('use_3ds2_flag').txt('1');
  cardHolderElement(request, params.holder);

  const xmlBody = doc.end({ prettyPrint: false });
  logger.info({ xmlBody }, 'enroll xml');

  if (simulateExternalCalls) {
    return {
      status: 'success',
      xid: `TEST-XID-${randomUUID()}`,
      // the SPA renders this in an iframe; in development it is a local stub page
      iframeUrl: `${env.publicUrl}/api/financial/3ds-stub?sendid=${encodeURIComponent(params.sendId)}`,
      raw: '<response><status>success</status></response>',
    };
  }

  const raw = await postXml(env.payment.reqUrl, xmlBody);
  return {
    status: firstText(raw, 'status'),
    xid: firstText(raw, 'xid'),
    iframeUrl: firstText(raw, 'iframeUrl'),
    raw,
  };
}

export interface Authenticate3dsResult {
  status: string | null;
  code: string | null;
  raw: string;
}

/** `secure_link_3d` / `authentication` — exchanges the PaRes for a verdict. */
export async function authenticate3ds(params: { xid: string; paRes: string }): Promise<Authenticate3dsResult> {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const request = doc.ele('request', { service: 'secure_link_3d', action: 'authentication' });
  request.ele('xid').txt(params.xid);
  request.ele('PaRes').txt(params.paRes);
  const xmlBody = doc.end({ prettyPrint: false });

  if (simulateExternalCalls) {
    return { status: 'success', code: '0', raw: '<response><status>success</status></response>' };
  }

  const raw = await postXml(env.payment.reqUrl, xmlBody);
  return { status: firstText(raw, 'status'), code: firstText(raw, 'code'), raw };
}

export interface Payment3dsResult {
  status: string | null;
  code: string | null;
  orderNumber: string | null;
  sendId: string | null;
  raw: string;
}

/** `secure_link_3d` / `payment` — captures after a successful authentication. */
export async function payment3ds(params: { xid: string; simulatedSendId?: string }): Promise<Payment3dsResult> {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const request = doc.ele('request', { service: 'secure_link_3d', action: 'payment' });
  request.ele('xid').txt(params.xid);
  request.ele('print_addition_value').txt('yes');
  const xmlBody = doc.end({ prettyPrint: false });

  if (simulateExternalCalls) {
    return {
      status: 'success',
      code: '0',
      orderNumber: `TEST-ORDER-${randomUUID()}`,
      sendId: params.simulatedSendId ?? null,
      raw: '<response><status>success</status></response>',
    };
  }

  const raw = await postXml(env.payment.reqUrl, xmlBody);
  return {
    status: firstText(raw, 'status'),
    code: firstText(raw, 'code'),
    orderNumber: firstText(raw, 'order_number'),
    sendId: firstText(raw, 'sendid'),
    raw,
  };
}

/**
 * FinancialHelper#account_duration_code — how long the card has been on file,
 * reported to the gateway as a risk signal.
 */
export function accountDurationCode(cardCreatedAt: Date | null | undefined): string {
  if (!cardCreatedAt) return '01';
  const now = Date.now();
  if (cardCreatedAt.getTime() > now) return '02';
  const daysElapsed = Math.floor((now - cardCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
  if (daysElapsed <= 29) return '03';
  if (daysElapsed <= 60) return '04';
  return '05';
}
