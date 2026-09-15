import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { env } from '@/server/config/env';

/**
 * Rails used `has_secure_password`, i.e. BCrypt with cost 12 in production.
 * bcryptjs reads and writes the same $2a$/$2b$ digests, so password_digest
 * values from the old database keep working unchanged.
 */
const BCRYPT_COST = env.isProduction ? 12 : 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, digest: string | null): Promise<boolean> {
  if (!digest) return false;
  try {
    return await bcrypt.compare(password, digest);
  } catch {
    return false;
  }
}

/** SecureRandom.urlsafe_base64 */
export function urlsafeBase64(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}

/** SecureRandom.alphanumeric(n) */
export function alphanumeric(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const buf = randomBytes(length);
  for (let i = 0; i < length; i += 1) out += chars[buf[i] % chars.length];
  return out;
}

/** Six-digit SMS verification code, zero padded (SecureRandom.random_number(0..999999)). */
export function smsVerificationCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}

/**
 * API token, identical in shape to SessionsController#api_login:
 * JWT HS256 over { aud: user.id, iat: … } signed with the app secret.
 */
export function signApiToken(userId: number): string {
  return jwt.sign({ aud: String(userId), iat: Math.floor(Date.now() / 1000) }, env.secretKeyBase, {
    algorithm: 'HS256',
  });
}

export function verifyApiToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.secretKeyBase, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const id = Number(aud);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Signed session cookie. Rails kept `session[:user_id]` in an encrypted cookie
 * plus a permanent signed `user_id`/`remember_token` pair; here one signed JWT
 * cookie carries the user id and the remember token stays a separate cookie
 * checked against users.remember_token, preserving the same two-tier behaviour.
 */
export interface SessionPayload {
  userId: number;
  /** scratch space the multi-step signup and SNS flows used session[] for */
  scratch?: Record<string, string>;
}

export function signSession(payload: SessionPayload, secret = env.secretKeyBase): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '30d' });
}

export function verifySession(token: string | undefined, secret = env.secretKeyBase): SessionPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload & SessionPayload;
    if (typeof payload.userId !== 'number') return null;
    return { userId: payload.userId, scratch: payload.scratch };
  } catch {
    return null;
  }
}

/** Admin panel session (separate secret, separate cookie, `admins` table). */
export interface AdminSessionPayload {
  adminId: number;
}

export function signAdminSession(payload: AdminSessionPayload): string {
  return jwt.sign(payload, env.adminSecretKeyBase, { algorithm: 'HS256', expiresIn: '12h' });
}

export function verifyAdminSession(token: string | undefined): AdminSessionPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.adminSecretKeyBase, { algorithms: ['HS256'] }) as jwt.JwtPayload &
      AdminSessionPayload;
    if (typeof payload.adminId !== 'number') return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'coco_session';
export const REMEMBER_COOKIE = 'coco_remember';
export const ADMIN_SESSION_COOKIE = 'coco_admin_session';
