import { config, lClock } from '@/lib';
import { env, simulateExternalCalls } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { prisma } from '@/server/lib/prisma';
import { broadcast, streams } from '@/server/realtime/bus';
import { simpleFormat } from '@/server/lib/sanitize';
import { parseShrineData, uploadUrl } from '@/server/lib/uploads';

/**
 * Ports SendWebMessage, SendPushMessage and SendSNSMessage — the three ways a
 * message leaves the system.
 */

// --- SendWebMessage (ActionCable) -----------------------------------------

export interface BroadcastableMessage {
  id: number;
  conversationId: number;
  senderId: number;
  category: string;
  content: string;
  sentAt: Date | null;
  sender: { nickName: string; profilePicUrl: string | null };
}

/**
 * SendWebMessage. Text bodies go over the wire pre-formatted with
 * `simple_format`, which is what the original did so the browser could drop the
 * payload straight into the DOM.
 */
export async function sendWebMessage(message: BroadcastableMessage, recipientIds: number[]): Promise<void> {
  const transferContent =
    message.category === 'text'
      ? simpleFormat(message.content)
      : message.category === 'picture'
        ? pictureUrlFromContent(message.content)
        : message.content;

  const profilePicUrl = message.sender.profilePicUrl || '/system/noimage.png';

  await Promise.all(
    recipientIds.map((userId) =>
      broadcast(streams.chatForUser(userId), {
        action_type: 'message_received',
        message_id: message.id,
        conversation_id: message.conversationId,
        sender_name: message.sender.nickName,
        sender_id: message.senderId,
        sent_at: message.sentAt ? lClock(message.sentAt) : '',
        content: transferContent,
        pic_url: profilePicUrl,
        content_type: message.category,
        sender_profile_pic: profilePicUrl,
      }),
    ),
  );
}

/**
 * Picture messages keep the Shrine JSON in `content` (the model redirected the
 * attacher's data_attribute onto that column), so the url has to be derived.
 */
export function pictureUrlFromContent(content: string): string {
  const data = parseShrineData(content);
  return uploadUrl(data) ?? content;
}

/** InformReadWorker's broadcast half. */
export async function broadcastMessagesRead(params: {
  conversationId: number;
  conversationCategory: string;
  recipientId: number;
  messageIds: number[];
}): Promise<void> {
  await broadcast(streams.chatForUser(params.recipientId), {
    action_type: 'messages_read',
    conversation_id: params.conversationId,
    conversation_type: params.conversationCategory,
    message_ids: params.messageIds,
  });
}

/** Used where the original pushed a `reload_page` action to force a refresh. */
export async function broadcastReloadPage(userId: number, conversationId: number | null): Promise<void> {
  await broadcast(streams.chatForUser(userId), {
    action_type: 'reload_page',
    conversation_id: conversationId,
  });
}

/** OpenReviewModalWorker — asks the client to open the review dialog. */
export async function broadcastOpenReviewModal(userId: number, meetingId: number): Promise<void> {
  await broadcast(streams.chatForUser(userId), {
    action_type: 'ajax_call',
    ajax_url: `/meetings/${meetingId}/review`,
    ajax_method: 'GET',
  });
}

export async function broadcastNewMeetingRequest(params: {
  businessAreaId: number;
  castLevelIds: number[];
  message: string;
  requesterId: number;
}): Promise<void> {
  await Promise.all(
    params.castLevelIds.map((castLevelId) =>
      broadcast(streams.meetingRequests(params.businessAreaId, castLevelId), {
        action_type: 'new_request',
        message: params.message,
        requester_id: params.requesterId,
      }),
    ),
  );
}

export async function broadcastMeetingRequestCanceled(params: {
  businessAreaId: number;
  castLevelIds: number[];
}): Promise<void> {
  await Promise.all(
    params.castLevelIds.map((castLevelId) =>
      broadcast(streams.meetingRequests(params.businessAreaId, castLevelId), {
        action_type: 'request_canceled',
      }),
    ),
  );
}

// --- SendPushMessage (Firebase Cloud Messaging) ---------------------------

interface PushRecipient {
  id: number;
  deviceIds: unknown;
}

function deviceIdsOf(user: PushRecipient): string[] {
  const raw = user.deviceIds;
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/** Mints an OAuth token for the FCM v1 API from the service account key. */
async function firebaseAccessToken(): Promise<string | null> {
  const { projectId, clientEmail, privateKey } = env.firebase;
  if (!projectId || !clientEmail || !privateKey) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;

  const jwtModule = await import('jsonwebtoken');
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwtModule.default.sign(
    {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    privateKey,
    { algorithm: 'RS256' },
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!response.ok) {
    logger.error({ status: response.status, body: await response.text() }, 'firebase token request failed');
    return null;
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export interface PushNotification {
  title: string;
  body: string;
}

/**
 * SendPushMessage. Invalid device tokens are pruned from users.device_ids, the
 * same self-healing the original did on UNREGISTERED / INVALID_ARGUMENT.
 */
export async function sendPushMessage(
  notification: PushNotification,
  recipients: PushRecipient[],
): Promise<void> {
  if (!recipients.length) return;

  if (simulateExternalCalls) {
    logger.debug({ notification, recipients: recipients.map((r) => r.id) }, 'push notification simulated');
    return;
  }

  const accessToken = await firebaseAccessToken();
  if (!accessToken) {
    logger.warn('sendPushMessage: firebase credentials are not configured, skipping');
    return;
  }

  for (const user of recipients) {
    const devices = deviceIdsOf(user);
    if (!devices.length) continue;

    for (const deviceId of devices) {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${env.firebase.projectId}/messages:send`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: { notification, token: deviceId } }),
          },
        );
        if (response.ok) continue;

        const body = (await response.json().catch(() => ({}))) as {
          error?: { details?: Array<{ errorCode?: string }> };
        };
        const errorCode = body.error?.details?.[0]?.errorCode?.toLowerCase();
        logger.error({ userId: user.id, errorCode }, "Couldn't send push notification");

        if (errorCode === 'unregistered' || errorCode === 'invalid_argument') {
          const remaining = devices.filter((id) => id !== deviceId);
          await prisma.user.update({ where: { id: user.id }, data: { deviceIds: remaining } });
          logger.error({ userId: user.id, deviceId }, 'Removed invalid device_id');
        }
      } catch (error) {
        logger.error({ error, userId: user.id }, 'push notification request threw');
      }
    }
  }
}

// --- SendSNSMessage (LINE Messaging API) ---------------------------------

/**
 * LINE message builders.
 *
 * NOTE: the original read these from app/views/sns_templates/{simple,rich}_message.ruby
 * and `eval`ed them. Those two files are absent from the source export, so the
 * bodies below are reconstructed from their call sites (the keys passed in as
 * template_data) against the LINE Messaging API message objects. If the
 * originals turn up, compare them here — the wire format is the only thing that
 * has to match.
 */
export function simpleLineMessage(data: { text: string }): Record<string, unknown> {
  return { type: 'text', text: data.text };
}

export interface RichMessageData {
  title: string;
  text: string;
  image_url?: string;
  button_text: string;
  url: string;
}

export function richLineMessage(data: RichMessageData): Record<string, unknown> {
  return {
    type: 'template',
    altText: data.title,
    template: {
      type: 'buttons',
      ...(data.image_url ? { thumbnailImageUrl: data.image_url, imageAspectRatio: 'square', imageSize: 'cover' } : {}),
      title: data.title.slice(0, 40),
      text: data.text.slice(0, 60),
      actions: [{ type: 'uri', label: data.button_text.slice(0, 20), uri: data.url }],
    },
  };
}

export type LineTemplate = 'sns_templates/simple_message.ruby' | 'sns_templates/rich_message.ruby';

export interface SnsRecipient {
  id: number;
  snsId: string | null;
}

/**
 * SendSNSMessage. Pushes to each recipient individually and keeps going when one
 * fails, so a single bad LINE id never aborts a whole broadcast.
 */
export async function sendSnsMessage(params: {
  recipients: SnsRecipient | SnsRecipient[];
  template: LineTemplate;
  templateData: Record<string, unknown>;
  simulate?: boolean;
}): Promise<{ success: number; failure: number }> {
  const recipients = Array.isArray(params.recipients) ? params.recipients : [params.recipients];
  const authToken = env.line.channelAccessToken;
  const simulate = params.simulate || simulateExternalCalls;

  if (!authToken && !simulate) {
    logger.error('SendSNSMessage: LINE_CHANNEL_ACCESS_TOKEN is not configured. LINE notifications will not be sent.');
    throw new Error('LINE channel access token is not configured');
  }

  const message =
    params.template === 'sns_templates/simple_message.ruby'
      ? simpleLineMessage(params.templateData as { text: string })
      : richLineMessage(params.templateData as unknown as RichMessageData);

  const withSnsId = recipients.filter((recipient) => !!recipient.snsId);
  const withoutSnsId = recipients.filter((recipient) => !recipient.snsId);

  if (withoutSnsId.length) {
    logger.warn(
      { userIds: withoutSnsId.map((r) => r.id) },
      `SendSNSMessage: ${withoutSnsId.length} recipient(s) have no sns_id`,
    );
  }
  if (!withSnsId.length) {
    logger.warn('SendSNSMessage: No recipients with sns_id. LINE notifications will not be sent.');
    return { success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;

  for (const recipient of withSnsId) {
    if (simulate) {
      success += 1;
      logger.info({ userId: recipient.id }, 'SendSNSMessage: simulated');
      continue;
    }
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient.snsId, messages: [message] }),
      });
      if (response.ok) {
        success += 1;
      } else {
        failure += 1;
        logger.error(
          { userId: recipient.id, status: response.status, body: await response.text() },
          'SendSNSMessage: LINE API error',
        );
      }
    } catch (error) {
      failure += 1;
      logger.error({ error, userId: recipient.id }, 'SendSNSMessage: LINE API exception');
    }
  }

  logger.info({ success, failure, total: withSnsId.length }, 'SendSNSMessage: completed');
  return { success, failure };
}

/** Absolute url for LINE buttons; `openExternalBrowser=1` dodges the in-app browser. */
export function lineDeepLink(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${env.hostPrefix}${path}${separator}openExternalBrowser=1`;
}

export function castNotificationsEnabled(): boolean {
  return config.cast_always_receive_meeting_notifications;
}
