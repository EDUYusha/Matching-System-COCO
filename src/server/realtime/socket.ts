import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { logger } from '@/server/lib/logger';
import { prisma } from '@/server/lib/prisma';
import { SESSION_COOKIE, verifyApiToken, verifySession } from '@/server/lib/auth';
import { createMessage, MAX_MESSAGE_LENGTH } from '@/server/services/messages';
import { markActivity } from '@/server/services/users';
import { streams, subscribeToBus, type CablePayload } from '@/server/realtime/bus';
import { config } from '@/lib';

/**
 * ActionCable replacement, part two: the sockets.
 *
 * The three Ruby channels map onto Socket.IO rooms with identical names:
 *   ChatChannel              → chat_channel_for_user_<id>
 *   SystemNotificationChannel → sys_notes_for_user_<id>
 *   MeetingChannel           → meeting_requests:<business_area>:<cast_level>
 *
 * Which meeting rooms a socket joins reproduces MeetingChannel#subscribed: admins
 * get every branch/level pair, operators their own branch, and a cast only their
 * own pair — and then only while they are marked available, unless the
 * cast_always_receive_meeting_notifications flag is on.
 *
 * The two client-callable actions are ChatChannel#send_message and #send_picture.
 */

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const index = part.indexOf('=');
      const key = part.slice(0, index).trim();
      const value = decodeURIComponent(part.slice(index + 1).trim());
      return [key, value];
    }),
  );
}

/** ApplicationCable::Connection#connect — rejects an unauthenticated socket. */
async function authenticateSocket(socket: Socket): Promise<number | null> {
  const cookies = parseCookies(socket.request.headers.cookie);
  const session = verifySession(cookies[SESSION_COOKIE]);
  if (session?.userId) {
    const user = await prisma.user.findFirst({
      where: { id: session.userId, discardedAt: null },
      select: { id: true },
    });
    if (user) return user.id;
  }

  // the mobile wrapper authenticates with the API token instead
  const token = socket.handshake.auth?.token as string | undefined;
  if (token) {
    const userId = verifyApiToken(token);
    if (userId) {
      const user = await prisma.user.findFirst({
        where: { id: userId, authToken: token, discardedAt: null },
        select: { id: true },
      });
      if (user) return user.id;
    }
  }

  return null;
}

export function attachSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    // the original mounted ActionCable at /websockets
    path: '/websockets',
    // no CORS block: the app and its sockets are one origin now
  });

  io.use(async (socket, next) => {
    try {
      const userId = await authenticateSocket(socket);
      if (!userId) return next(new Error('unauthorized'));
      socket.data.userId = userId;
      return next();
    } catch (error) {
      logger.error({ error }, 'socket authentication failed');
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as number;

    /*
     * Everything that touches the database is guarded, because Socket.IO does
     * not await or catch this callback: a pool timeout during a reconnect storm
     * became an unhandled rejection that killed the process serving every HTTP
     * request as well. A failure here costs this socket its meeting-request
     * rooms; the chat rooms above and the handlers below are registered either
     * way.
     */
    await subscribeToMeetingRooms(socket, userId).catch((error: unknown) => {
      logger.error({ error, userId }, 'socket meeting subscription failed');
    });

    logger.debug({ userId }, 'socket connected');

    /** ChatChannel#send_message */
    socket.on('send_message', async (data: { conversation_id?: number; content?: string }) => {
      try {
        if (!data?.conversation_id || !data.content) return;
        // the same cap the HTTP path applies; the socket had none at all
        if (data.content.length > MAX_MESSAGE_LENGTH) {
          socket.emit('error_message', { message: 'メッセージが長すぎます' });
          return;
        }
        const speaker = await prisma.speaker.findFirst({
          where: { conversationId: Number(data.conversation_id), userId },
          select: { id: true },
        });
        if (!speaker) return;

        await createMessage({
          conversationId: Number(data.conversation_id),
          senderId: userId,
          content: data.content,
          sentAt: new Date(),
          withUnread: true,
          withBroadcast: true,
        });
        await markActivity(userId);
      } catch (error) {
        logger.error({ error, userId }, 'send_message failed');
        socket.emit('error_message', { message: 'メッセージの送信に失敗しました' });
      }
    });

    /** ChatChannel#send_picture — content is the uploaded file's Shrine JSON. */
    socket.on('send_picture', async (data: { conversation_id?: number; content?: string }) => {
      try {
        if (!data?.conversation_id || !data.content) return;
        const speaker = await prisma.speaker.findFirst({
          where: { conversationId: Number(data.conversation_id), userId },
          select: { id: true },
        });
        if (!speaker) return;

        await createMessage({
          conversationId: Number(data.conversation_id),
          senderId: userId,
          category: 'picture',
          content: data.content,
          sentAt: new Date(),
          withUnread: true,
          withBroadcast: true,
          withoutFormat: true,
        });
        await markActivity(userId);
      } catch (error) {
        logger.error({ error, userId }, 'send_picture failed');
      }
    });

    socket.on('disconnect', () => logger.debug({ userId }, 'socket disconnected'));
  });

  // relay everything published by the API and the workers
  subscribeToBus((payload: CablePayload) => {
    io.to(payload.stream).emit('cable', payload.data);
  });

  return io;
}

/** MeetingChannel#subscribed — the rooms a socket gets by role and area. */
async function subscribeToMeetingRooms(socket: Socket, userId: number): Promise<void> {
  socket.join(streams.chatForUser(userId));
  socket.join(streams.systemNotesForUser(userId));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      userType: true,
      businessAreaId: true,
      castLevelId: true,
      availableUntil: true,
    },
  });

  if (user) {
    if (user.userType === 'admin' || user.userType === 'system') {
      const pairs = await prisma.castLevelsRank.findMany({
        include: { castRank: { select: { businessAreaId: true } } },
      });
      for (const pair of pairs) {
        socket.join(streams.meetingRequests(pair.castRank.businessAreaId, pair.castLevelId));
      }
    } else if (user.userType === 'operator' && user.businessAreaId) {
      const pairs = await prisma.castLevelsRank.findMany({
        where: { castRank: { businessAreaId: user.businessAreaId } },
        include: { castRank: { select: { businessAreaId: true } } },
      });
      for (const pair of pairs) {
        socket.join(streams.meetingRequests(pair.castRank.businessAreaId, pair.castLevelId));
      }
    } else if (
      user.businessAreaId &&
      user.castLevelId &&
      ((user.availableUntil && user.availableUntil.getTime() > Date.now()) ||
        config.cast_always_receive_meeting_notifications)
    ) {
      socket.join(streams.meetingRequests(user.businessAreaId, user.castLevelId));
    }
  }
}
