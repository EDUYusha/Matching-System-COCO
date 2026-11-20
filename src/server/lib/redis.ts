import Redis from 'ioredis';
import { env } from '@/server/config/env';

/**
 * The shared connection for ordinary Redis commands.
 *
 * `realtime/bus.ts` deliberately keeps its own: a connection in subscriber
 * mode cannot issue commands, so pub/sub needs dedicated sockets. Everything
 * else — rate limits, the SMS verification store — belongs here rather than
 * opening a connection per module.
 */

let client: Redis | null = null;

export function redis(): Redis {
  client ??= new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  return client;
}
