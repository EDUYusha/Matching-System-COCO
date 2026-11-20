import { createServer } from 'node:http';
import next from 'next';
import { logger } from '@/server/lib/logger';
import { attachSocketServer } from '@/server/realtime/socket';
import { env } from '@/server/config/env';
// from peer-ip, not from http/route: anything that reaches `next/server` must
// not be loaded here before app.prepare() (see the note in that file)
import { PEER_IP_HEADER } from '@/server/http/peer-ip';
import { prisma } from '@/server/lib/prisma';

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
    /*
     * The connection's own address, for the internal-API allow-list. A route
     * handler sees only headers, so it is passed as one — and any copy the
     * client sent is deleted first, or the allow-list could be spoofed by
     * simply claiming to be on the private network.
     */
    delete request.headers[PEER_IP_HEADER];
    const peer = request.socket.remoteAddress;
    if (peer) request.headers[PEER_IP_HEADER] = peer;

    handle(request, response).catch((error: unknown) => {
      logger.error({ error, url: request.url }, 'request failed');
      response.statusCode = 500;
      response.end('Internal Server Error');
    });
  });

  const io = attachSocketServer(server);

  server.listen(env.port, env.host, () => {
    logger.info({ url: `http://localhost:${env.port}`, dev }, 'coco-v3 ready');
  });

  /*
   * One process serves every HTTP request and every websocket, so an unhandled
   * rejection anywhere used to take the whole site down: Node's default is to
   * throw, and nothing was listening. They are logged and survived instead —
   * except an uncaught exception, where the process state is no longer
   * trustworthy, so it is logged and then exited for the supervisor to restart.
   */
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (error: unknown) => {
    logger.fatal({ error }, 'uncaught exception, exiting');
    process.exit(1);
  });

  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'shutting down');

      /*
       * `server.close()` alone never finishes here: it waits for open
       * connections, and Socket.IO's are open by design, so every deploy ended
       * in a SIGKILL with requests in flight. The sockets are closed first and
       * a timer bounds the wait either way.
       */
      const forced = setTimeout(() => {
        logger.warn('shutdown timed out, exiting anyway');
        process.exit(0);
      }, 10_000);
      forced.unref();

      void io.close(() => {
        server.close(() => {
          void prisma.$disconnect().finally(() => process.exit(0));
        });
      });
    });
  }
}

main().catch((error: unknown) => {
  logger.error({ error }, 'failed to start');
  process.exit(1);
});
