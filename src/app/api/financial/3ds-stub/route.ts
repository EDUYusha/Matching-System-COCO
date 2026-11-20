import { z } from 'zod';
import { NextResponse } from 'next/server';
import { env, simulateExternalCalls } from '@/server/config/env';
import { query, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/**
 * FinancialController#3ds_stub — stands in for the issuer's 3-D Secure page in
 * the environments where no real card is ever registered.
 *
 * It used to be a dead end: static HTML with no form and no script, telling the
 * reader that closing the window would be treated as success. Nothing posted
 * anything, and the gateway that would have called `termUrl` does not exist
 * here, so card registration and point purchase could not complete at all
 * outside production — the card stayed `invalid`, the token kept its pending
 * `!` prefix, and the points were never added. Both flows simply hung.
 *
 * It now sends the success callback itself, which is what the issuer's page
 * does once the cardholder has authenticated.
 */

export const GET = route(async (_request, { searchParams }) => {
  // where a real issuer page exists, this one must not
  if (!simulateExternalCalls) return new NextResponse('Not Found', { status: 404 });

  const params = query(
    searchParams,
    z.object({
      sendid: z.string().optional(),
      term_url: z.string().optional(),
      md: z.string().optional(),
    }),
  );

  const sendid = (params.sendid ?? '').replace(/[<>&"']/g, '');

  /*
   * `term_url` arrives in the query string, so it is honoured only when it
   * addresses one of our own callbacks. Posting to whatever it says would make
   * this page a relay for anything that can get a browser to open it.
   */
  const callbackPrefix = `${env.publicUrl}/api/financial/`;
  const termUrl =
    params.term_url && params.term_url.startsWith(callbackPrefix) ? params.term_url : null;

  const body = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>3DS (development stub)</title>
<body style="font-family:system-ui;padding:24px">
<h3>3-D Secure スタブ（開発環境）</h3>
<p>本番では発行会社の認証画面が表示されます。</p>
<p>sendid: <code>${sendid}</code></p>
<p id="state">認証結果を送信しています…</p>
<button id="again" type="button" hidden>もう一度送信する</button>
<script>
const TERM_URL = ${JSON.stringify(termUrl)};
const MD = ${JSON.stringify(params.md ?? '')};
const state = document.getElementById('state');
const again = document.getElementById('again');
async function send() {
  if (!TERM_URL) {
    state.textContent = 'コールバック先が渡されていないため、何も送信できません（term_url なし）。';
    return;
  }
  state.textContent = '認証結果を送信しています…';
  try {
    const response = await fetch(TERM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'success', MD: MD, PaRes: 'STUB-PARES' }),
    });
    state.textContent = response.ok
      ? '認証完了。元の画面が自動で更新されます。'
      : '送信に失敗しました（HTTP ' + response.status + '）。';
  } catch (error) {
    state.textContent = '送信に失敗しました。';
  }
  again.hidden = false;
}
again.addEventListener('click', send);
send();
</script>
</body></html>`;

  // route() passed only a NextResponse through until this was found, which is
  // how the previous version of this page managed to answer `{}`
  return new NextResponse(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});
