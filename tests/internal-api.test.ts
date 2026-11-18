/**
 * The response contract of the internal API, written against the CakePHP
 * panel's own conditions rather than against our handlers.
 *
 * The panel ignores the HTTP status and branches on the body:
 *
 *     // finish / complete
 *     if ($result->getBody() == '' || $resultBody->error !== '') { 登録処理完了 }
 *     // advance / cancelOrder
 *     if ($resultBody->error === '') { 登録処理完了 }
 *
 * So the one shape both accept for success is an empty body, and the one shape
 * both read as failure is a JSON `error` with text in it. Anything else — a Zod
 * field map, `{"error":"","ok":true}` — tells at least one call site that a
 * cancellation which charged nothing completed successfully.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ZodError } from 'zod';
import {
  internalApiError,
  railsBadRequest,
  railsOk,
  railsServerError,
  RailsParameterMissing,
  RailsRecordNotFound,
} from '@/server/http/internal-api';

/** `if ($result->getBody() == '' || $resultBody->error !== '')` */
function finishCallSiteSeesSuccess(body: string): boolean {
  if (body === '') return true;
  let error: unknown = null;
  try {
    error = (JSON.parse(body) as { error?: unknown }).error ?? null;
  } catch {
    error = null; // json_decode of an HTML page gives null
  }
  return error !== '';
}

/** `if ($resultBody->error === '')`, with an absent error treated as empty */
function advanceCallSiteSeesSuccess(body: string): boolean {
  if (body === '') return true;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return (parsed.error ?? '') === '';
  } catch {
    return false;
  }
}

describe('success', () => {
  it('is 200 with a zero-length body', async () => {
    const response = railsOk();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });

  it('is an empty 204 where the old action rendered nothing at all', async () => {
    const response = railsOk(204);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
  });

  it('is read as success by both of the panel call sites', () => {
    assert.equal(finishCallSiteSeesSuccess(''), true);
    assert.equal(advanceCallSiteSeesSuccess(''), true);
  });

  it('shows how the body we used to send broke the finish call site', () => {
    assert.equal(finishCallSiteSeesSuccess('{"error":"","ok":true}'), false);
  });
});

describe('failure', () => {
  it('renders a status guard as 400 with the message', async () => {
    const response = internalApiError(railsBadRequest('Meeting must have status ›finished‹'));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Meeting must have status ›finished‹' });
  });

  it('renders a model validation as 500 with an array, as full_messages was', async () => {
    const response = internalApiError(railsServerError(['Ownerを入力してください']));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: ['Ownerを入力してください'] });
  });

  it('is read as failure by the advance call site', async () => {
    const body = await internalApiError(railsBadRequest('キャストは既に参加します')).text();
    assert.equal(advanceCallSiteSeesSuccess(body), false);

    /*
     * And as SUCCESS by the finish/complete one, because its condition tests
     * `error !== ''` — a non-empty error passes it. That is the panel's own
     * inversion, and the old Rails app rendered exactly this body, so copying
     * the body faithfully also copies the misreport. Nothing we can return
     * fixes it: the only body that call site reads as a failure is a JSON
     * object whose `error` is the empty string, which is the shape that made
     * every successful call look failed.
     */
    assert.equal(finishCallSiteSeesSuccess(body), true);
  });

  it('renders a missing parameter group as Rails 400 page, not JSON', async () => {
    const response = internalApiError(new RailsParameterMissing('cast_attendance'));
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.match(await response.text(), /400 Bad Request/);
  });

  it('renders a missing record as the Rails 404 page', async () => {
    for (const error of [new RailsRecordNotFound(), { code: 'P2025' }]) {
      const response = internalApiError(error);
      assert.equal(response.status, 404);
      assert.match(await response.text(), /doesn't exist/);
    }
  });

  it('renders an unexpected exception as the Rails 500 page', async () => {
    const response = internalApiError(new Error('boom'));
    assert.equal(response.status, 500);
    assert.match(await response.text(), /something went wrong/);
  });

  it('never answers 422, even if a schema somehow rejects input', async () => {
    const response = internalApiError(new ZodError([]));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: [] });
  });
});
