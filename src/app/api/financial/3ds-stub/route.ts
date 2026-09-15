import { z } from 'zod';
import { query, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/**
 * FinancialController#3ds_stub — stands in for the issuer's 3-D Secure page in
 * development, where no real card is ever registered.
 */
export const GET = route(async (_request, { searchParams }) => {
  const params = query(searchParams, z.object({ sendid: z.string().optional() }));
  const sendid = (params.sendid ?? '').replace(/[<>&"']/g, '');

  return new Response(
    `<!doctype html><meta charset="utf-8"><title>3DS (development stub)</title>
<body style="font-family:system-ui;padding:24px">
<h3>3-D Secure スタブ（開発環境）</h3>
<p>本番では発行会社の認証画面が表示されます。</p>
<p>sendid: <code>${sendid}</code></p>
<p>このウィンドウを閉じると、API が成功としてコールバックを処理します。</p>
</body>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
});
