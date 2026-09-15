import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // pdfkit and argon2 are native/CJS; keep them out of the bundler
  serverExternalPackages: ['pdfkit', 'argon2', 'bullmq', 'ioredis', 'nodemailer', 'pino'],
  typedRoutes: false,
};

export default config;
