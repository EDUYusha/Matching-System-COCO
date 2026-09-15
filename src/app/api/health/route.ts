import { NextResponse } from 'next/server';
import { env } from '@/server/config/env';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, env: env.nodeEnv, app: 'coco-v3' });
}
