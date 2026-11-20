/**
 * Regression tests for the security defects fixed on this branch. Each case is
 * written as the attack it blocks, so a future refactor that reopens one fails
 * here rather than in production.
 *
 * Only pure paths are covered: no database, no Redis, in keeping with the rest
 * of the suite.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { expandParams, mergeParams } from '../src/server/http/params';
import { internalApiDenial } from '../src/server/http/internal-api';
import { internalApiAllowed } from '../src/server/api/internal-api-shared';
import { sanitizeSystemHtml } from '../src/server/lib/sanitize';
import { smsVerificationCode } from '../src/server/lib/auth';
import { verifyCode } from '../src/server/services/sms-verification';

describe('param expansion cannot reach Object.prototype', () => {
  it('ignores a __proto__ path instead of writing through it', () => {
    const before = Object.getPrototypeOf({}) as object;
    const params = expandParams(new URLSearchParams('__proto__[polluted]=yes'));

    assert.equal((({}) as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf({}), before);
    assert.equal(params.polluted, undefined);
  });

  it('ignores constructor and prototype paths too', () => {
    expandParams(new URLSearchParams('constructor[prototype][x]=1&prototype[y]=2'));
    assert.equal((({}) as Record<string, unknown>).x, undefined);
    assert.equal((({}) as Record<string, unknown>).y, undefined);
  });

  it('drops __proto__ when a JSON body is merged over the query', () => {
    const body = JSON.parse('{"__proto__":{"polluted":"yes"},"keep":"1"}') as Record<string, unknown>;
    const merged = mergeParams({}, body);

    assert.equal((({}) as Record<string, unknown>).polluted, undefined);
    assert.equal(merged.keep, '1');
  });

  it('still expands the nesting the operator panel sends', () => {
    const params = expandParams(
      new URLSearchParams('meeting[calculation_settings][fee]=500&ids[]=1&ids[]=2'),
    );
    const meeting = params.meeting as Record<string, unknown>;
    const settings = meeting.calculation_settings as Record<string, unknown>;

    assert.equal(settings.fee, '500');
    assert.deepEqual(params.ids, ['1', '2']);
  });
});

describe('the internal API refuses callers that are neither local nor keyed', () => {
  const requestFrom = (headers: Record<string, string>) =>
    new NextRequest('http://localhost:3000/api/internal_api/financial/credit_exchange', {
      method: 'POST',
      headers,
    });

  it('allows a request whose peer address is localhost', () => {
    assert.equal(internalApiDenial(requestFrom({ 'x-coco-peer-ip': '127.0.0.1' })), null);
  });

  it('allows a peer inside RAILS_LOCAL_ZONE', () => {
    assert.equal(internalApiDenial(requestFrom({ 'x-coco-peer-ip': '10.1.2.3' })), null);
  });

  it('refuses a peer on the public internet', () => {
    const denial = internalApiDenial(requestFrom({ 'x-coco-peer-ip': '203.0.113.5' }));
    assert.equal(denial?.status, 403);
  });

  it('does not let x-forwarded-for pass off a public caller as local', () => {
    // the header is only believed when TRUST_PROXY_HEADERS says a proxy rewrites it
    const denial = internalApiDenial(
      requestFrom({ 'x-coco-peer-ip': '203.0.113.5', 'x-forwarded-for': '127.0.0.1' }),
    );
    assert.equal(denial?.status, 403);
  });

  it('knows which addresses are local', () => {
    assert.equal(internalApiAllowed('127.0.0.1'), true);
    assert.equal(internalApiAllowed('::1'), true);
    assert.equal(internalApiAllowed('192.168.1.40'), true);
    assert.equal(internalApiAllowed('203.0.113.5'), false);
    assert.equal(internalApiAllowed(undefined), false);
  });
});

describe('system message markup is sanitised', () => {
  it('strips an onerror payload planted in a nickname', () => {
    const nickName = '<img src=x onerror="fetch(`/api/me`)">';
    const html = sanitizeSystemHtml(`${nickName}さんがオーダーをキャンセルしました`);

    assert.ok(!html.includes('onerror'));
    assert.ok(html.includes('さんがオーダーをキャンセルしました'));
  });

  it('strips a script tag but keeps the markup system messages really use', () => {
    const html = sanitizeSystemHtml(
      '<p>ご予約<strong>確定</strong></p><script>alert(1)</script><a href="https://co-co.today/help">ヘルプ</a>',
    );

    assert.ok(!html.includes('<script'));
    assert.ok(html.includes('<strong>確定</strong>'));
    assert.ok(html.includes('href="https://co-co.today/help"'));
  });

  it('drops a javascript: link', () => {
    const html = sanitizeSystemHtml('<a href="javascript:alert(1)">tap</a>');
    assert.ok(!html.includes('javascript:'));
  });
});

describe('SMS verification', () => {
  it('generates a six-digit code', () => {
    for (let i = 0; i < 50; i += 1) {
      assert.match(smsVerificationCode(), /^\d{6}$/);
    }
  });

  it('does not repeat itself across a small sample', () => {
    const codes = new Set(Array.from({ length: 50 }, () => smsVerificationCode()));
    assert.ok(codes.size > 40, `expected varied codes, got ${codes.size} distinct of 50`);
  });

  it('rejects a submission with no server-side record, without consulting Redis', async () => {
    const result = await verifyCode(undefined, '123456');
    assert.deepEqual(result, { ok: false, reason: 'expired' });
  });
});
