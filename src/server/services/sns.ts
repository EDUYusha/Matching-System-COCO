import jwt from 'jsonwebtoken';
import { createHmac, randomBytes } from 'node:crypto';
import { env, simulateExternalCalls } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { SNSApiError } from '@/server/lib/errors';

/**
 * Port of SNSAuthorize plus the LINE login URL building from SessionsController.
 *
 * "SNS" throughout the original means LINE specifically. The id_token is a JWT
 * signed with the channel secret (HS256), which is why verification needs no
 * key fetch.
 */

export interface SnsAuthorizeResult {
  snsId: string;
  snsName: string | null;
  snsProfilePicUrl: string | null;
}

/** SessionsController#sns_login_redirection */
export function lineAuthorizeUrl(params: {
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: env.line.channelId,
    redirect_uri: params.redirectUri,
    state: params.state,
    nonce: params.nonce,
    scope: 'openid profile',
    ui_locales: 'ja',
    prompt: 'consent',
    bot_prompt: 'aggressive',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${query.toString()}`;
}

export function generateNonce(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * ApplicationController#sns_csrf_token — HMACs the app id with a per-session
 * secret so the provider never sees the CSRF token itself.
 */
export function snsCsrfToken(sessionSecret: string): string {
  return createHmac('sha256', sessionSecret)
    .update(env.line.channelId)
    .digest('base64')
    .replace(/[^A-Za-z0-9]/g, '');
}

/** SNSAuthorize — exchanges the auth code for an id_token and reads the profile. */
export async function snsAuthorize(params: {
  authCode: string;
  nonce?: string | null;
  prevUrl: string;
  simulate?: boolean;
}): Promise<SnsAuthorizeResult> {
  const simulate = params.simulate || (simulateExternalCalls && !env.line.channelSecret);

  let body: { id_token?: string };

  if (simulate) {
    body = { id_token: buildTestIdToken(params.nonce ?? null) };
  } else {
    const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.authCode,
        // must be the same return url that produced this auth code
        redirect_uri: params.prevUrl,
        client_id: env.line.channelId,
        client_secret: env.line.channelSecret,
      }).toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, text }, 'Line API reports error');
      throw new SNSApiError(`Connection error ${response.status}`);
    }

    try {
      body = (await response.json()) as { id_token?: string };
    } catch (error) {
      throw new SNSApiError(`Invalid response: ${(error as Error).message}`);
    }
  }

  if (!body.id_token) throw new SNSApiError('SNS response contains no id_token');

  const token = verifyIdToken(body.id_token, params.nonce ?? null);
  if (!token.sub) throw new SNSApiError('SNS response contains no user_id');

  return {
    snsId: String(token.sub),
    snsName: (token.name as string | undefined) ?? null,
    snsProfilePicUrl: (token.picture as string | undefined) ?? null,
  };
}

function verifyIdToken(idToken: string, nonce: string | null): jwt.JwtPayload {
  try {
    const payload = jwt.verify(idToken, env.line.channelSecret || 'test-secret', {
      algorithms: ['HS256'],
      issuer: 'https://access.line.me',
    }) as jwt.JwtPayload;
    if (nonce && payload.nonce !== nonce) throw new SNSApiError('Invalid security token');
    return payload;
  } catch (error) {
    if (error instanceof SNSApiError) throw error;
    throw new SNSApiError('SNS response is invalid');
  }
}

/** SNSAuthorize#test_response — the development/test stand-in. */
function buildTestIdToken(nonce: string | null): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://access.line.me',
      sub: 'TEST_USER_ID',
      aud: 'TEST_CHANNEL',
      exp: now + 3600,
      iat: now,
      ...(nonce ? { nonce } : {}),
      amr: ['pwd'],
      name: 'TEST',
    },
    env.line.channelSecret || 'test-secret',
    { algorithm: 'HS256' },
  );
}
