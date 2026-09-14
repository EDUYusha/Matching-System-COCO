import { createServer } from 'node:http';
import next from 'next';
import { logger } from '@/server/lib/logger';
import { attachSocketServer } from '@/server/realtime/socket';
import { env } from '@/server/config/env';

/**
 * Custom Next server.
 *
 * Next is the whole application — pages, layouts and every API route. It is
 * wrapped here for one reason: the chat needs a WebSocket, and Next's own
 * request handler has nowhere to attach one. So the HTTP server is created
 * explicitly, Next handles every request, and Socket.IO takes the upgrades on
 * /websockets (the path the original mounted ActionCable at).
 *
 * `next dev` still works on its own (npm run dev:next) for anything that does
 * not need the socket.
 */

const dev = !env.isProduction;
const app = next({ dev, hostname: env.host, port: env.port });
const handle = app.getRequestHandler();

async function main(): Promise<void> {
  await app.prepare();

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      logger.error({ error, url: request.url }, 'request failed');
      response.statusCode = 500;
      response.end('Internal Server Error');
    });
  });

  attachSocketServer(server);

  server.listen(env.port, env.host, () => {
    logger.info({ url: `http://localhost:${env.port}`, dev }, 'coco-v3 ready');
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutting down');
      server.close(() => process.exit(0));
    });
  }
}

main().catch((error: unknown) => {
  logger.error({ error }, 'failed to start');
  process.exit(1);
});
