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

  /*
   * Baseline security headers, which the app had none of. No CSP yet: the chat
   * and the profile screens render an allow-listed subset of user HTML with
   * inline `style` attributes, so a useful policy needs the styles audited
   * first — that is a separate change, not a one-liner here.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default config;
