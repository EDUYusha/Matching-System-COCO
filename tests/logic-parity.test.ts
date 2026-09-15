/**
 * Regression tests for the pure rules behind the logic-parity fixes
 * (docs/logic-test-results.md). Run with `npm test`; no database needed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dbDate, isoDate, tokyoMonthsAgo } from '@/lib/datetime';
import { stickerSendRefusal } from '@/lib/sticker-rules';
import { chargeCallbackSignature, verifyChargeCallbackSignature } from '@/server/lib/charge-callback';

const jst = (value: string) => new Date(`${value}+09:00`);

describe('tokyoMonthsAgo (Q66 patron reaper dates)', () => {
  const cases: Array<[string, number, string]> = [
    ['2026-09-15T08:30:00', 1, '2026-08-15'],
    ['2026-09-15T08:30:00', 2, '2026-07-15'],
    ['2026-03-31T08:30:00', 1, '2026-02-28'],
    ['2026-03-31T08:30:00', 2, '2026-01-31'],
    ['2026-04-30T08:30:00', 2, '2026-02-28'],
    ['2026-05-31T08:30:00', 1, '2026-04-30'],
    ['2028-03-31T08:30:00', 1, '2028-02-29'],
    ['2026-01-15T08:30:00', 2, '2025-11-15'],
    ['2026-09-15T00:10:00', 1, '2026-08-15'],
  ];
  for (const [now, months, expected] of cases) {
    it(`${now} JST minus ${months} month(s) is ${expected}`, () => {
      assert.equal(isoDate(tokyoMonthsAgo(months, jst(now))), expected);
    });
  }
});

describe('dbDate (Q8 date-only columns)', () => {
  it('is UTC midnight of the calendar day', () => {
    assert.equal(dbDate('2026-09-01').toISOString(), '2026-09-01T00:00:00.000Z');
  });
  it('reads back as the same Tokyo date', () => {
    assert.equal(isoDate(dbDate('2026-09-01')), '2026-09-01');
    assert.equal(isoDate(dbDate('2026-12-31')), '2026-12-31');
  });
});

describe('stickerSendRefusal (Q87 gift permissions, checked before charging)', () => {
  it('refuses a paid gift from a cast', () => {
    assert.equal(stickerSendRefusal('cast', 5000), 'Only customers can send non-free stickers');
  });
  it('refuses a free gift from a guest', () => {
    assert.equal(stickerSendRefusal('customer', 0), 'Only cast can send free stickers');
  });
  it('allows a paid gift from a guest or inviter', () => {
    assert.equal(stickerSendRefusal('customer', 5000), null);
    assert.equal(stickerSendRefusal('inviter', 5000), null);
  });
  it('allows a free gift from a cast', () => {
    assert.equal(stickerSendRefusal('cast', 0), null);
  });
});

describe('charge callback signature (H5 parres_buy amounts)', () => {
  const signature = chargeCallbackSignature('XID-1', 11000, 10000);

  it('accepts the amounts it signed', () => {
    assert.equal(verifyChargeCallbackSignature('XID-1', 11000, 10000, signature), true);
  });
  it('rejects edited credits or yen', () => {
    assert.equal(verifyChargeCallbackSignature('XID-1', 11000, 515000, signature), false);
    assert.equal(verifyChargeCallbackSignature('XID-1', 1100, 10000, signature), false);
  });
  it('rejects the signature on a different transaction', () => {
    assert.equal(verifyChargeCallbackSignature('XID-2', 11000, 10000, signature), false);
  });
  it('rejects a malformed signature', () => {
    assert.equal(verifyChargeCallbackSignature('XID-1', 11000, 10000, 'not-hex'), false);
    assert.equal(verifyChargeCallbackSignature('XID-1', 11000, 10000, ''), false);
  });
});
