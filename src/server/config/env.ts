import { resolve } from 'node:path';

/*
 * Next loads .env itself for anything it bundles. The custom server and the
 * BullMQ worker start outside that, so they are run with `node --env-file`
 * (see the npm scripts) rather than pulling in dotenv.
 */

function str(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function num(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : Number(value);
}

function bool(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function list(name: string, fallback: string[] = []): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export const NODE_ENV = str('NODE_ENV', 'development');
export const isProduction = NODE_ENV === 'production';
export const isStaging = NODE_ENV === 'staging';
export const isTest = NODE_ENV === 'test';
export const isDevelopment = !isProduction && !isStaging && !isTest;

export const env = {
  nodeEnv: NODE_ENV,
  isProduction,
  isStaging,
  isTest,
  isDevelopment,

  databaseUrl: str('DATABASE_URL', 'postgresql://coco:coco@localhost:5432/coco_v3'),
  /*
   * Database 1, so the BullMQ queues never collide with the v2 stack sharing
   * this Redis. Queue names are identical between the two builds.
   */
  redisUrl: str('REDIS_URL', 'redis://localhost:6379/1'),

  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  publicUrl: str('PUBLIC_URL', 'http://localhost:3000'),

  /**
   * Replaces Rails.configuration.host_prefix — used in LINE deep links and
   * mails. The app is served from a single origin now, so this is that origin.
   */
  hostPrefix: str('HOST_PREFIX', 'http://localhost:3000'),

  secretKeyBase: str('SECRET_KEY_BASE', 'development-secret-key-base-change-me-0000000000000000000000000'),
  adminSecretKeyBase: str('ADMIN_SECRET_KEY_BASE', 'development-admin-secret-change-me-00000000000000000000000000000'),

  /** InternalApi::BaseController#must_be_local_request */
  localZones: list('RAILS_LOCAL_ZONE', ['10.0.0.0/8', '172.17.0.0/16', '192.168.0.0/16']),

  // turbopackIgnore: read at runtime only; without this the tracer pulls the
  // whole project (public/ included) into the server bundle
  uploadsDir: resolve(/* turbopackIgnore: true */ process.cwd(), str('UPLOADS_DIR', './uploads')),
  castPicturesDir: resolve(
    /* turbopackIgnore: true */ process.cwd(),
    str('CAST_PICTURES_DIR', './uploads/cast_pictures'),
  ),

  line: {
    channelId: str('LINE_CHANNEL_ID', ''),
    channelSecret: str('LINE_CHANNEL_SECRET', ''),
    channelAccessToken: str('LINE_CHANNEL_ACCESS_TOKEN', ''),
  },

  twilio: {
    accountSid: str('TWILIO_ACCOUNT_SID', ''),
    authToken: str('TWILIO_AUTH_TOKEN', ''),
    fromNumber: str('TWILIO_FROM_NUMBER', ''),
  },

  payment: {
    cardRegisterUrl: str('PAYMENT_CARD_REGISTER_URL', 'https://gw.axes-payment.com/cgi-bin/secure.cgi'),
    processingUrl: str('PAYMENT_PROCESSING_URL', 'https://gw.axes-payment.com/cgi-bin/secure.cgi'),
    reqUrl: str('PAYMENT_REQ_URL', 'https://gw.axes-payment.com/cgi-bin/secure/api.cgi'),
    clientIp: str('PAYMENT_CLIENT_IP', ''),
    zkey: str('PAYMENT_ZKEY', ''),
  },

  firebase: {
    projectId: str('FIREBASE_PROJECT_ID', ''),
    clientEmail: str('FIREBASE_CLIENT_EMAIL', ''),
    privateKey: str('FIREBASE_PRIVATE_KEY', '').replace(/\\n/g, '\n'),
  },

  smtp: {
    host: str('SMTP_HOST', 'localhost'),
    port: num('SMTP_PORT', 1025),
    user: str('SMTP_USER', ''),
    password: str('SMTP_PASSWORD', ''),
    secure: bool('SMTP_SECURE', false),
    from: str('MAIL_FROM', 'no-reply@co-co.today'),
  },
  adminEmailAddresses: list('ADMIN_EMAIL_ADDRESSES', isDevelopment ? ['test_admin@example.net'] : []),
} as const;

/**
 * In the original these were toggled by Rails.env. `simulate` short-circuits the
 * outbound API calls (LINE, SMS, card processing) so development and tests never
 * touch a live provider, exactly like the `unless Rails.env.production?` guards
 * and the ALWAYS_SUCCEED / ALWAYS_FAIL creditcard tokens did.
 */
export const simulateExternalCalls = !isProduction && !isStaging;
