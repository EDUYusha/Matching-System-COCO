import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { with3dsStubCallback } from '../src/server/services/payment-gateway';
import { recordCosts } from '../src/server/services/meetings/model';
import { orderFormSchema } from '../src/server/services/order-forms';

/*
 * The parity gaps closed after the September logic test. NODE_ENV is `test`
 * here, so simulateExternalCalls is true and the 3DS stub path is the live one.
 *
 * services/conversations is deliberately not imported: it reaches
 * services/messages, which opens the queue and bus connections at import and
 * so never lets the test process exit. PRIVATE_ROOM_RULES_WARNING is covered by
 * the typechecker instead — its three callers import it by name.
 */

describe('3-D Secure stub callback', () => {
  const iframeUrl = 'http://localhost:3000/api/financial/3ds-stub?sendid=abc';
  const termUrl = 'http://localhost:3000/api/financial/parres';

  it('hands the stub the callback url and the transaction id', () => {
    const result = with3dsStubCallback(iframeUrl, termUrl, 'XID-1');
    assert.ok(result);
    const params = new URL(result).searchParams;
    assert.equal(params.get('term_url'), termUrl);
    assert.equal(params.get('md'), 'XID-1');
    // the sendid the stub already carried survives
    assert.equal(params.get('sendid'), 'abc');
  });

  it('omits md when the enrol returned no xid', () => {
    const result = with3dsStubCallback(iframeUrl, termUrl, null);
    assert.ok(result);
    assert.equal(new URL(result).searchParams.has('md'), false);
  });

  it('passes a missing iframe url straight through', () => {
    assert.equal(with3dsStubCallback(null, termUrl, 'XID-1'), null);
  });

  it('keeps a signed purchase callback intact, query string and all', () => {
    const signed = 'http://localhost:3000/api/financial/parres_buy?charge_amount=11000&credits=10000&sig=abc123';
    const result = with3dsStubCallback(iframeUrl, signed, 'XID-2');
    assert.ok(result);
    assert.equal(new URL(result).searchParams.get('term_url'), signed);
  });
});

describe('rank price snapshot (Meeting#record_costs)', () => {
  const rank = { baseCostPerTime: 3000, prolongCostPerTime: 3900 };

  it('takes the rank prices when the caller gives none', () => {
    assert.deepEqual(recordCosts({}, rank), { baseCostPerTime: 3000, prolongCostPerTime: 3900 });
  });

  it('prefers prices the caller supplied', () => {
    assert.deepEqual(recordCosts({ baseCostPerTime: 5000, prolongCostPerTime: 6000 }, rank), {
      baseCostPerTime: 5000,
      prolongCostPerTime: 6000,
    });
  });

  it('leaves both null with no rank and no prices, as a 1:1 order does', () => {
    assert.deepEqual(recordCosts({}, null), { baseCostPerTime: null, prolongCostPerTime: null });
  });
});

describe('order form person counts', () => {
  const base = {
    businessAreaId: 1,
    areaId: 1,
    neededPersonCount: 2,
    castRankId: 1,
    timeSpan: 60,
  };

  it('refuses a negative minimum, which used to be stored as given', () => {
    assert.throws(() => orderFormSchema.parse({ ...base, minimumPersonCount: -5 }));
  });

  it('still accepts 0, the "unspecified" value normaliseOrderForm drops', () => {
    assert.equal(orderFormSchema.parse({ ...base, minimumPersonCount: 0 }).minimumPersonCount, 0);
  });

  it('still accepts a real minimum and an absent one', () => {
    assert.equal(orderFormSchema.parse({ ...base, minimumPersonCount: 2 }).minimumPersonCount, 2);
    assert.equal(orderFormSchema.parse(base).minimumPersonCount, undefined);
  });
});
