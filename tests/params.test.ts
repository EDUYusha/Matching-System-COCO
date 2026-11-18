/**
 * Tests for the Rack-style parameter reader the internal API uses, written
 * against the shapes the CakePHP operator panel actually sends. Run with
 * `npm test`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expandParams,
  mergeParams,
  railsBoolean,
  railsFlag,
  railsFullMessage,
  railsPresence,
  railsToInt,
  railsToTime,
  requestParams,
} from '@/server/http/params';

const form = (body: string, url = 'http://localhost/api/internal_api/x') =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

describe('expandParams (bracket keys)', () => {
  it('keeps a plain key', () => {
    assert.deepEqual(expandParams(new URLSearchParams('cancel_fee=5000')), { cancel_fee: '5000' });
  });

  it('nests one level', () => {
    assert.deepEqual(expandParams(new URLSearchParams('cast_attendance[user_id]=12')), {
      cast_attendance: { user_id: '12' },
    });
  });

  it('nests several levels', () => {
    assert.deepEqual(
      expandParams(new URLSearchParams('meeting[calculation_settings][base_cost_per_time]=12000')),
      { meeting: { calculation_settings: { base_cost_per_time: '12000' } } },
    );
  });

  it('collects repeats into a list', () => {
    assert.deepEqual(expandParams(new URLSearchParams('meeting[preferences][]=a&meeting[preferences][]=b')), {
      meeting: { preferences: ['a', 'b'] },
    });
  });

  it('keeps the last value of a repeated plain key', () => {
    assert.deepEqual(expandParams(new URLSearchParams('amount=1&amount=2')), { amount: '2' });
  });

  it('leaves an unbalanced bracket alone', () => {
    assert.deepEqual(expandParams(new URLSearchParams('a[b=1')), { 'a[b': '1' });
  });

  it('keeps an empty value as an empty string', () => {
    assert.deepEqual(expandParams(new URLSearchParams('end_time=&finish_message=')), {
      end_time: '',
      finish_message: '',
    });
  });
});

describe('mergeParams', () => {
  it('lets the body win over the query', () => {
    assert.deepEqual(mergeParams({ a: '1' }, { a: '2' }), { a: '2' });
  });

  it('merges nested objects instead of replacing them', () => {
    assert.deepEqual(mergeParams({ m: { a: '1' } }, { m: { b: '2' } }), { m: { a: '1', b: '2' } });
  });
});

describe('requestParams', () => {
  it('reads a form-encoded body', async () => {
    const params = await requestParams(
      form('cancel_fee=5000&charge_back=true&error_message=&inform_participants='),
    );
    assert.deepEqual(params, {
      cancel_fee: '5000',
      charge_back: 'true',
      error_message: '',
      inform_participants: '',
    });
  });

  it('reads the query string of a bodyless POST', async () => {
    const request = new Request('http://localhost/api/internal_api/unread_messages?message_id=42', {
      method: 'POST',
    });
    assert.deepEqual(await requestParams(request), { message_id: '42' });
  });

  it('reads query and form body together, as Rails params did', async () => {
    const params = await requestParams(
      form('finish_message=done', 'http://localhost/api/internal_api/meetings/1/finish?end_time=2026-11-18T12:00:00'),
    );
    assert.deepEqual(params, { end_time: '2026-11-18T12:00:00', finish_message: 'done' });
  });

  it('reads a JSON body, for our own operator screens', async () => {
    const request = new Request('http://localhost/api/internal_api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: 1, content: 'hi', with_unread: true }),
    });
    assert.deepEqual(await requestParams(request), {
      conversation_id: 1,
      content: 'hi',
      with_unread: true,
    });
  });

  it('treats a body with no content type as JSON first', async () => {
    const request = new Request('http://localhost/api/internal_api/messages', {
      method: 'POST',
      body: '{"content":"hi"}',
    });
    assert.deepEqual(await requestParams(request), { content: 'hi' });
  });

  it('is empty for a bodyless POST with no query', async () => {
    assert.deepEqual(
      await requestParams(new Request('http://localhost/api/internal_api/meetings/1/schedule', { method: 'POST' })),
      {},
    );
  });

  it('expands bracket form fields into the nested shape the schemas expect', async () => {
    const params = await requestParams(
      form('meeting[owner_id]=5&meeting[needed_person_count]=2&no_pre_charge=1'),
    );
    assert.deepEqual(params, {
      meeting: { owner_id: '5', needed_person_count: '2' },
      no_pre_charge: '1',
    });
  });
});

describe('railsBoolean', () => {
  const cases: Array<[unknown, boolean]> = [
    ['1', true],
    ['true', true],
    ['0', false],
    ['false', false],
    ['', false],
    [true, true],
    [false, false],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(railsBoolean.parse(input), expected);
    });
  }
});

/*
 * The coercions. Ruby converted instead of rejecting, so none of these may
 * throw: a rejection reaches the panel as a body with no `error` key, which it
 * reports to the operator as success.
 */
describe('railsToInt (String#to_i)', () => {
  const cases: Array<[unknown, number]> = [
    ['5000', 5000],
    ['12abc', 12],
    ['abc', 0],
    ['', 0],
    [undefined, 0],
    [null, 0],
    ['  42 ', 42],
    ['-5', -5],
    ['+7', 7],
    ['1.9', 1],
    ['1_000', 1000],
    ['0x10', 0],
    [1.9, 1],
    [3, 3],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(railsToInt(input), expected);
    });
  }
});

describe('railsToTime (String#to_time)', () => {
  it('reads the format the panel sends', () => {
    assert.equal(railsToTime('2026-11-18 20:00:00')?.getHours(), 20);
  });

  it('reads an ISO string', () => {
    assert.equal(railsToTime('2026-11-18T20:00:00')?.getHours(), 20);
  });

  it('is null for blank, absent and unparseable values, never an error', () => {
    assert.equal(railsToTime(''), null);
    assert.equal(railsToTime('   '), null);
    assert.equal(railsToTime(undefined), null);
    assert.equal(railsToTime('not a time'), null);
  });
});

describe('railsFlag (the panel checkboxes)', () => {
  it('is true only for the two strings Rails cast', () => {
    assert.equal(railsFlag('1'), true);
    assert.equal(railsFlag('true'), true);
  });

  it('is false for everything else, a JSON boolean included', () => {
    for (const value of ['0', 'false', 'on', 'yes', '', undefined, null, true, 1]) {
      assert.equal(railsFlag(value), false, `expected ${JSON.stringify(value)} to be false`);
    }
  });
});

describe('railsPresence (Object#presence)', () => {
  it('turns a blank string into null', () => {
    assert.equal(railsPresence(''), null);
    assert.equal(railsPresence('   '), null);
    assert.equal(railsPresence(undefined), null);
  });

  it('keeps anything else as it was, untrimmed', () => {
    assert.equal(railsPresence('all'), 'all');
    assert.equal(railsPresence(' owner '), ' owner ');
  });
});

describe('railsFullMessage (errors.full_messages)', () => {
  it('humanizes the attribute and drops a trailing _id, as Rails does', () => {
    assert.equal(railsFullMessage('owner_id', 'を入力してください'), 'Ownerを入力してください');
    assert.equal(
      railsFullMessage('needed_person_count', 'を入力してください'),
      'Needed person countを入力してください',
    );
  });
});
