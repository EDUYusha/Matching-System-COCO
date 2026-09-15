'use client';

import { io, type Socket } from 'socket.io-client';

/**
 * Client half of the ActionCable replacement.
 *
 * The server emits a single `cable` event whose payload is the hash the Ruby
 * broadcast, so the `action_type` switch below is the same set of cases the
 * CoffeeScript channel handlers had:
 *   message_received / messages_read / reload_page / ajax_call
 *   new_request / request_canceled
 */

export interface CableMessageReceived {
  action_type: 'message_received';
  message_id: number;
  conversation_id: number;
  sender_name: string;
  sender_id: number;
  sent_at: string;
  content: string;
  pic_url: string;
  content_type: string;
  sender_profile_pic: string;
}

export interface CableMessagesRead {
  action_type: 'messages_read';
  conversation_id: number;
  conversation_type: string;
  message_ids: number[];
}

export interface CableReloadPage {
  action_type: 'reload_page';
  conversation_id: number | null;
}

export interface CableAjaxCall {
  action_type: 'ajax_call';
  ajax_url: string;
  ajax_method: string;
}

export interface CableNewRequest {
  action_type: 'new_request';
  message: string;
  requester_id: number;
}

export interface CableRequestCanceled {
  action_type: 'request_canceled';
}

export type CablePayload =
  | CableMessageReceived
  | CableMessagesRead
  | CableReloadPage
  | CableAjaxCall
  | CableNewRequest
  | CableRequestCanceled;

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket =
    socket ??
    io({
      path: '/websockets',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function onCable(handler: (payload: CablePayload) => void): () => void {
  const active = connectSocket();
  const listener = (payload: CablePayload) => handler(payload);
  active.on('cable', listener);
  return () => {
    active.off('cable', listener);
  };
}

/** ChatChannel#send_message */
export function sendMessageOverSocket(conversationId: number, content: string): void {
  connectSocket().emit('send_message', { conversation_id: conversationId, content });
}

/** ChatChannel#send_picture — content is the uploaded file's Shrine descriptor. */
export function sendPictureOverSocket(conversationId: number, content: string): void {
  connectSocket().emit('send_picture', { conversation_id: conversationId, content });
}
