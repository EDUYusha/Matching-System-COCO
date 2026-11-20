import { NextResponse } from 'next/server';
import Redis from 'ioredis';
import { env } from '@/server/config/env';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';
export const dynamic = 'force-dynamic';

/**
 * Readiness, as opposed to the liveness answer at /api/health — which only says
 * the process is up, so a load balancer kept sending traffic to an instance
 * whose database was unreachable. This one actually touches both dependencies
 * and answers 503 when either is down.
 */

let probe: Redis | null = null;

function redis(): Redis {
  probe ??= new Redis(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  return probe;
}

async function check(name: string, run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    logger.error({ error, dependency: name }, 'readiness check failed');
    return false;
  }
}

export async function GET() {
  const [database, cache] = await Promise.all([
    check('postgres', () => prisma.$queryRaw`SELECT 1`),
    check('redis', () => redis().ping()),
  ]);

  const ok = database && cache;
  return NextResponse.json({ ok, database, cache, app: 'coco-v3' }, { status: ok ? 200 : 503 });
}
