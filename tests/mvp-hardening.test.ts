import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { join, sep } from 'node:path';
import { after, describe, it } from 'node:test';
import { env } from '../src/server/config/env';
import { resolveUploadPath } from '../src/server/lib/upload-path';
import { consumeRateLimit, enforceRateLimit, RateLimitedError } from '../src/server/lib/rate-limit';
import { redis } from '../src/server/lib/redis';

/*
 * The upload mount and the request limits added for the MVP. The upload tests
 * are pure; the rate-limit tests need the development Redis and are skipped
 * when it is not reachable, so the suite still runs on a bare checkout.
 */

describe('upload path resolution', () => {
  it('serves an image from either Shrine storage', () => {
    for (const storage of ['cache', 'store']) {
      const target = resolveUploadPath([storage, 'ab', 'cdef.jpg']);
      assert.ok(target, `${storage} should resolve`);
      assert.equal(target.storage, storage);
      assert.equal(target.contentType, 'image/jpeg');
      assert.equal(target.path, join(env.uploadsDir, storage, 'ab', 'cdef.jpg'));
    }
  });

  it('maps each allowed extension, case-insensitively', () => {
    const expected: Record<string, string> = {
      'a.jpg': 'image/jpeg',
      'a.JPEG': 'image/jpeg',
      'a.png': 'image/png',
      'a.gif': 'image/gif',
      'a.WebP': 'image/webp',
    };
    for (const [name, contentType] of Object.entries(expected)) {
      assert.equal(resolveUploadPath(['store', 'ab', name])?.contentType, contentType, name);
    }
  });

  it('refuses anything that is not an allowed image', () => {
    for (const name of ['a.ts', 'a.svg', 'a.html', 'a', 'a.png.ts', '.png']) {
      assert.equal(resolveUploadPath(['store', 'ab', name]), null, name);
    }
  });

  it('refuses storages other than cache and store', () => {
    // cast_pictures is a real sibling directory holding identity documents
    for (const storage of ['cast_pictures', 'CACHE', '', '.', 'store2']) {
      assert.equal(resolveUploadPath([storage, 'a.png']), null, storage);
    }
  });

  it('cannot be walked out of the mount', () => {
    const escapes = [
      ['store', '..', 'cast_pictures', 'a.png'],
      ['store', '..', '..', 'a.png'],
      ['store', 'ab', '..', '..', 'cast_pictures', 'a.png'],
      ['cache', '..', 'store', 'a.png'],
    ];
    for (const segments of escapes) {
      assert.equal(resolveUploadPath(segments), null, segments.join('/'));
    }
  });

  it('keeps a legitimate nested path inside the storage root', () => {
    const target = resolveUploadPath(['store', 'ab', 'cd', 'ef.png']);
    assert.ok(target);
    assert.ok(target.path.startsWith(join(env.uploadsDir, 'store') + sep));
  });

  it('refuses a NUL byte and an empty path', () => {
    assert.equal(resolveUploadPath(['store', 'a\0.png']), null);
    assert.equal(resolveUploadPath(['store']), null);
    assert.equal(resolveUploadPath([]), null);
  });
});

describe('rate limiting', async () => {
  let reachable = false;
  try {
    await redis().ping();
    reachable = true;
  } catch {
    reachable = false;
  }

  after(async () => {
    if (reachable) await redis().quit();
  });

  const rule = { limit: 3, windowSeconds: 60 };

  it('allows up to the limit, then reports the wait', { skip: !reachable }, async () => {
    const who = randomUUID();
    for (let attempt = 1; attempt <= rule.limit; attempt += 1) {
      assert.equal(await consumeRateLimit('test', who, rule), null, `attempt ${attempt}`);
    }
    const retryAfter = await consumeRateLimit('test', who, rule);
    assert.ok(typeof retryAfter === 'number' && retryAfter > 0, 'should report seconds to wait');
    assert.ok(retryAfter <= rule.windowSeconds);
  });

  it('counts each identifier separately', { skip: !reachable }, async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    for (let attempt = 0; attempt < rule.limit; attempt += 1) {
      await consumeRateLimit('test', a, rule);
    }
    assert.equal(await consumeRateLimit('test', a, rule) === null, false, 'a is spent');
    assert.equal(await consumeRateLimit('test', b, rule), null, 'b is untouched');
  });

  it('counts each scope separately', { skip: !reachable }, async () => {
    const who = randomUUID();
    for (let attempt = 0; attempt < rule.limit; attempt += 1) {
      await consumeRateLimit('scope-one', who, rule);
    }
    assert.equal(await consumeRateLimit('scope-two', who, rule), null);
  });

  it('gives an absent identifier its own bucket rather than sharing one', { skip: !reachable }, async () => {
    // clientIp() returns undefined when there is no custom server
    const first = await consumeRateLimit(`anon-${randomUUID()}`, undefined, rule);
    assert.equal(first, null);
  });

  it('throws a 429 once the limit is spent', { skip: !reachable }, async () => {
    const who = randomUUID();
    for (let attempt = 0; attempt < rule.limit; attempt += 1) {
      await enforceRateLimit('test', who, rule);
    }
    await assert.rejects(
      () => enforceRateLimit('test', who, rule),
      (error: unknown) => {
        assert.ok(error instanceof RateLimitedError);
        assert.equal(error.statusCode, 429);
        assert.match(error.message, /リクエストが多すぎます/);
        return true;
      },
    );
  });
});
