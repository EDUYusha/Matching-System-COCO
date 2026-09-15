import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/server/config/env';

/**
 * The 3-D Secure callback (parres_buy) learns what to book from the query string
 * of the termUrl handed to the gateway. The amounts are signed together with the
 * gateway's transaction id (xid, posted back as MD), so an edited or re-targeted
 * callback cannot book more credits than the charge that was authorised.
 */
export function chargeCallbackSignature(xid: string, yen: number, credits: number): string {
  return createHmac('sha256', env.secretKeyBase).update(`parres_buy:${xid}:${yen}:${credits}`).digest('hex');
}

export function verifyChargeCallbackSignature(xid: string, yen: number, credits: number, signature: string): boolean {
  const expected = Buffer.from(chargeCallbackSignature(xid, yen, credits), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
