import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // pdfkit and argon2 are native/CJS; keep them out of the bundler
  serverExternalPackages: ['pdfkit', 'argon2', 'bullmq', 'ioredis', 'nodemailer', 'pino'],
  typedRoutes: false,
  /*
   * The operator panel posts to `/internal_api/unread_messages/` with a trailing
   * slash and does not follow redirects, so Next's own 308 would silently
   * swallow the call. src/middleware.ts takes over both the trailing slash and
   * the `/internal_api` -> `/api/internal_api` rewrite.
   */
  skipTrailingSlashRedirect: true,
};

export default config;
