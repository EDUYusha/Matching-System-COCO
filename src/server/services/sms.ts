import { env, simulateExternalCalls } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { AppError } from '@/server/lib/errors';
import { smsVerificationCode } from '@/server/lib/auth';

/**
 * Port of UsersController#send_verification_message (Twilio).
 *
 * The original normalised Japanese numbers to E.164 by replacing a leading 0
 * with +81, and surfaced Twilio error 21211 as "不正な電話番号です。" — both kept.
 */

export interface SendVerificationResult {
  code: string;
  phone: string;
}

function toE164(phone: string): string {
  return phone.startsWith('0') ? `+81${phone.slice(1)}` : `+81${phone}`;
}

export async function sendVerificationSms(phone: string): Promise<SendVerificationResult> {
  const code = smsVerificationCode();
  const fullPhoneNumber = toE164(phone);

  /*
   * Unconfigured Twilio used to mean "return success without sending", in every
   * environment — a verification gate that reported OK while doing nothing, with
   * the live code in the production log. Simulating is a development
   * convenience; outside development a missing credential is an error.
   */
  if (simulateExternalCalls || !env.twilio.accountSid) {
    if (!env.isDevelopment && !env.isTest) {
      logger.error({ phone: fullPhoneNumber }, 'SMS verification requested but Twilio is not configured');
      throw new AppError('SMS連携の設定がありません。管理者に連絡してください。');
    }
    logger.info({ phone: fullPhoneNumber, code }, 'SMS verification simulated (code logged, not sent)');
    return { code, phone };
  }

  const auth = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Body: code, From: env.twilio.fromNumber, To: fullPhoneNumber }).toString(),
    },
  );

  const body = (await response.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };

  if (!response.ok) {
    if (body.code === 21211) throw new AppError('不正な電話番号です。');
    logger.error({ phone: fullPhoneNumber, body }, 'Failed sending sms');
    throw new AppError(body.message ?? 'SMS連携のエラーが発生しました。管理者に連絡してください。');
  }

  if (body.status !== 'queued' && body.status !== 'accepted' && body.status !== 'sent') {
    logger.error({ phone: fullPhoneNumber, body }, 'Unexpected Twilio status');
    throw new AppError(
      '大変申し訳ございません、SMS連携のエラーが発生しました。管理者に連絡してください。',
    );
  }

  return { code, phone };
}
