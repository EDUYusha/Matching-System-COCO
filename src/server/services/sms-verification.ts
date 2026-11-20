import { randomUUID, timingSafeEqual } from 'node:crypto';
import Redis from 'ioredis';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';

/**
 * Server-side store for the SMS verification code.
 *
 * The code used to be put in the session itself, and the session is a signed —
 * not encrypted — JWT, so the caller could read the expected code straight out
 * of their own cookie and "verify" a phone number they did not control. Only a
 * handle lives in the session now; the code never leaves the server.
 *
 * Redis rather than a table because the schema has no migration history yet,
 * and a code with a ten-minute life is exactly what a TTL is for. It also gives
 * the attempt counter a place to live, so a six-digit code cannot be guessed.
 */

const KEY_PREFIX = 'sms_verification:';
const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

let client: Redis | null = null;

function redis(): Redis {
  client ??= new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  return client;
}

interface StoredVerification {
  code: string;
  phone: string;
  attempts: number;
}

/** Equal-length constant-time compare; lengths differing is itself a mismatch. */
function codeMatches(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Keeps `code` for `phone` and returns the handle to store in the session.
 * The handle is random and carries no secret, so it is safe in a cookie.
 */
export async function issueVerification(phone: string, code: string): Promise<string> {
  const id = randomUUID();
  const stored: StoredVerification = { code, phone, attempts: 0 };
  await redis().set(`${KEY_PREFIX}${id}`, JSON.stringify(stored), 'EX', TTL_SECONDS);
  return id;
}

export type VerificationResult =
  | { ok: true; phone: string }
  | { ok: false; reason: 'expired' | 'mismatch' | 'too_many_attempts' };

/**
 * Checks a submitted code against the stored one. A success and a fifth failure
 * both drop the record, so a code is single-use and not brute-forceable.
 */
export async function verifyCode(id: string | undefined, submitted: string): Promise<VerificationResult> {
  if (!id) return { ok: false, reason: 'expired' };

  const key = `${KEY_PREFIX}${id}`;
  const raw = await redis().get(key);
  if (!raw) return { ok: false, reason: 'expired' };

  let stored: StoredVerification;
  try {
    stored = JSON.parse(raw) as StoredVerification;
  } catch {
    await redis().del(key);
    return { ok: false, reason: 'expired' };
  }

  if (codeMatches(submitted, stored.code)) {
    await redis().del(key);
    return { ok: true, phone: stored.phone };
  }

  const attempts = stored.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await redis().del(key);
    logger.warn({ attempts }, 'sms verification: too many attempts, code discarded');
    return { ok: false, reason: 'too_many_attempts' };
  }

  // keep the remaining TTL rather than extending it
  const ttl = await redis().ttl(key);
  await redis().set(
    key,
    JSON.stringify({ ...stored, attempts }),
    'EX',
    ttl > 0 ? ttl : TTL_SECONDS,
  );
  return { ok: false, reason: 'mismatch' };
}
