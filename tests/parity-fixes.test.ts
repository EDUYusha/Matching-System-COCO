import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { with3dsStubCallback } from '../src/server/services/payment-gateway';
import { recordCosts } from '../src/server/services/meetings/model';
import { orderFormSchema } from '../src/server/services/order-forms';
import { route } from '../src/server/http/route';
import { buildReceiptPdf } from '../src/server/services/receipt-pdf';
import { env } from '../src/server/config/env';

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

describe('route() with a handler that returns bytes', () => {
  const fakeRequest = { nextUrl: { searchParams: new URLSearchParams() } } as never;
  const fakeContext = { params: Promise.resolve({}) } as never;

  it('passes a plain Response through instead of serialising it as {}', async () => {
    const handler = route(async () => new Response('hello', { headers: { 'Content-Type': 'text/plain' } }));
    const response = await handler(fakeRequest, fakeContext);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/plain');
    // this returned the string "{}" until route() stopped checking for
    // NextResponse specifically: the receipt PDF, the cast identity photo and
    // the 3-D Secure stub page all answered `{}` instead of their content
    assert.equal(await response.text(), 'hello');
  });

  it('still turns a returned value into JSON', async () => {
    const handler = route(async () => ({ ok: true, n: 1 }));
    const response = await handler(fakeRequest, fakeContext);
    assert.deepEqual(await response.json(), { ok: true, n: 1 });
  });

  it('still answers { ok: true } for a handler that returns nothing', async () => {
    const handler = route(async () => undefined);
    assert.deepEqual(await (await handler(fakeRequest, fakeContext)).json(), { ok: true });
  });
});

describe('receipt pdf', () => {
  async function render(): Promise<Buffer> {
    const doc = buildReceiptPdf({
      conversionId: 42,
      createdAt: new Date('2026-11-20T03:00:00Z'),
      amount: 12345,
      names: ['山田 太郎'],
      company: null,
    });
    // buildReceiptPdf ends the document itself
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  it('renders a PDF whether or not a font is configured', async () => {
    const pdf = await render();
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(pdf.length > 1000);
  });

  it(
    'embeds the configured Japanese font',
    // the path is per-machine, so this only runs where one is set
    { skip: !env.receiptFontPath },
    async () => {
      const text = (await render()).toString('latin1');
      // PDFKit's built-in fonts are WinAnsi-only: without an embedded font the
      // Japanese labels and the digits beside them both came out as mojibake
      assert.match(text, /FontFile2/);
      assert.match(text, /Identity-H/);
      assert.match(text, /ToUnicode/);
    },
  );
});
