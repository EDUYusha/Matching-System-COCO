import pino from 'pino';
import { env } from '@/server/config/env';

export const logger = pino(
  env.isDevelopment
    ? {
        level: 'debug',
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
      }
    : { level: 'info' },
);

export type Logger = typeof logger;
