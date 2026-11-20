/**
 * The header the custom server stamps with the connection's remote address, so
 * a Route Handler can see the peer — it is given only headers, and the
 * internal-API allow-list has to know who is really calling.
 *
 * Its own module, deliberately: server.ts needs this constant, and it must not
 * import anything that reaches `next/server`. Loading Next's request internals
 * in the plain Node process before `app.prepare()` fails the
 * "AsyncLocalStorage accessed in runtime where it is not available" invariant
 * and the server does not start at all.
 */
export const PEER_IP_HEADER = 'x-coco-peer-ip';
