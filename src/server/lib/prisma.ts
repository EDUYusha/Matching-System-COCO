import { PrismaClient } from '@prisma/client';
import { env } from '@/server/config/env';

export const prisma = new PrismaClient({
  log: env.isDevelopment ? ['warn', 'error'] : ['error'],
});

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
