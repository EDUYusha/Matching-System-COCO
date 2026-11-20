import { AppError } from '@/server/lib/errors';
import { logger } from '@/server/lib/logger';
import { redis } from '@/server/lib/redis';

/**
 * Request limits for the endpoints where repetition is the attack.
 *
 * Nothing limited anything before this: the SMS endpoint sends a real Twilio
 * message per call, so a loop ran up the bill, and login and password reset
 * could be tried as fast as the network allowed.
 *
 * A fixed window (INCR plus EXPIRE on first use) rather than a sliding log:
 * one round trip, no per-request bookkeeping, and the worst case is a caller
 * getting two windows' worth of attempts across a boundary — which, for limits
 * meant to stop thousands of tries, does not matter.
 */

export interface RateLimit {
  limit: number;
  windowSeconds: number;
}

const HOUR = 60 * 60;

export const RATE_LIMITS = {
  /** One Twilio message per call, so this is the one that costs real money. */
  smsPerPhone: { limit: 5, windowSeconds: HOUR },
  smsPerIp: { limit: 20, windowSeconds: HOUR },

  /** Generous: a demo or a shared office NATs many people to one address. */
  loginPerIp: { limit: 30, windowSeconds: 5 * 60 },
  loginPerAccount: { limit: 10, windowSeconds: 15 * 60 },

  passwordResetPerEmail: { limit: 5, windowSeconds: HOUR },
  passwordResetPerIp: { limit: 20, windowSeconds: HOUR },

  signupPerIp: { limit: 20, windowSeconds: HOUR },
} as const satisfies Record<string, RateLimit>;

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    super(`リクエストが多すぎます。${minutes}分ほどお待ちください。`, { statusCode: 429 });
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Counts one use of `scope` by `identifier`. Returns the seconds left in the
 * window once the limit is spent, or null while the caller is still inside it.
 *
 * Redis failures allow the request. Redis is already required for the queues
 * and the websocket, so it being down is an outage either way, and failing
 * closed here would turn it into one that locks every user out of logging in.
 */
export async function consumeRateLimit(
  scope: string,
  identifier: string | undefined,
  rule: RateLimit,
): Promise<number | null> {
  const key = `rate:${scope}:${identifier ?? 'unknown'}`;

  try {
    const client = redis();
    const used = await client.incr(key);
    if (used === 1) await client.expire(key, rule.windowSeconds);
    if (used <= rule.limit) return null;

    const ttl = await client.ttl(key);
    return ttl > 0 ? ttl : rule.windowSeconds;
  } catch (error) {
    logger.warn({ error, scope }, 'rate limit check failed, allowing the request');
    return null;
  }
}

/** `consumeRateLimit`, but throws the 429 the route handlers turn into JSON. */
export async function enforceRateLimit(
  scope: string,
  identifier: string | undefined,
  rule: RateLimit,
): Promise<void> {
  const retryAfter = await consumeRateLimit(scope, identifier, rule);
  if (retryAfter === null) return;

  logger.warn({ scope, identifier, limit: rule.limit }, 'rate limit exceeded');
  throw new RateLimitedError(retryAfter);
}
