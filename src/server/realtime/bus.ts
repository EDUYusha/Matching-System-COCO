import Redis from 'ioredis';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';

/**
 * ActionCable replacement, part one: the cross-process fan-out.
 *
 * `ActionCable.server.broadcast "stream", payload` was callable from anywhere —
 * controllers, interactors and Sidekiq workers alike. Sockets only live in the
 * API process, so every caller publishes onto this Redis channel instead and the
 * API process relays it to the matching Socket.IO room. Stream names are kept
 * byte-for-byte ("chat_channel_for_user_42", "meeting_requests:1:3") so the two
 * systems could even run side by side during a migration.
 */
const CHANNEL = 'coco:cable';

export interface CablePayload {
  stream: string;
  data: Record<string, unknown>;
}

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    publisher.on('error', (error) => logger.error({ error }, 'cable publisher error'));
  }
  return publisher;
}

/** Equivalent of ActionCable.server.broadcast. */
export async function broadcast(stream: string, data: Record<string, unknown>): Promise<void> {
  const payload: CablePayload = { stream, data };
  try {
    await getPublisher().publish(CHANNEL, JSON.stringify(payload));
  } catch (error) {
    logger.error({ error, stream }, 'cable broadcast failed');
  }
}

/** Called once in the API process to relay published payloads into Socket.IO. */
export function subscribeToBus(onMessage: (payload: CablePayload) => void): Redis {
  const subscriber = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  subscriber.on('error', (error) => logger.error({ error }, 'cable subscriber error'));
  subscriber.subscribe(CHANNEL).catch((error: unknown) => {
    logger.error({ error }, 'cable subscribe failed');
  });
  subscriber.on('message', (_channel, raw) => {
    try {
      onMessage(JSON.parse(raw) as CablePayload);
    } catch (error) {
      logger.error({ error, raw }, 'cable payload parse failed');
    }
  });
  return subscriber;
}

export async function closeBus(): Promise<void> {
  await publisher?.quit();
  publisher = null;
}

// --- stream name builders (the string literals used across the Ruby app) ---

export const streams = {
  chatForUser: (userId: number) => `chat_channel_for_user_${userId}`,
  systemNotesForUser: (userId: number) => `sys_notes_for_user_${userId}`,
  meetingRequests: (businessAreaId: number, castLevelId: number) =>
    `meeting_requests:${businessAreaId}:${castLevelId}`,
};
