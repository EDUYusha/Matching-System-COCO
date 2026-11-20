import { PrismaClient } from '@prisma/client';
import { env } from '@/server/config/env';

/*
 * Cached on globalThis in development. Next re-evaluates server modules on every
 * edit, and a fresh PrismaClient each time brings its own connection pool that
 * nothing disconnects — a handful of saves and Postgres answers
 * `too many clients already`. Production constructs it exactly once.
 */
const globalForPrisma = globalThis as typeof globalThis & { cocoPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.cocoPrisma ??
  new PrismaClient({
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) globalForPrisma.cocoPrisma = prisma;

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Runs `fn` inside a transaction, or reuses the one already in flight. Ported
 * code calls this wherever the Ruby said `ActiveRecord::Base.transaction`, which
 * nests by joining the outer transaction rather than opening a new one.
 */
export async function transaction<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction(async (inner) => fn(inner), { timeout: 30_000, maxWait: 10_000 });
}
