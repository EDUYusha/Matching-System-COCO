/**
 * Tests for the display formatters the member screens use. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTalkTime } from '@/client/format';

const jst = (value: string) => new Date(`${value}+09:00`);

describe('formatTalkTime (talk list timestamps)', () => {
  // a Tuesday
  const now = jst('2026-09-15T12:00:00');

  const cases: Array<[string, string, string]> = [
    ['earlier today', '2026-09-15T07:33:00', '7:33'],
    ['just after Tokyo midnight, still the previous day in UTC', '2026-09-15T00:10:00', '0:10'],
    ['yesterday', '2026-09-14T23:50:00', '昨日'],
    ['within the week', '2026-09-12T18:00:00', '土曜日'],
    ['a week ago', '2026-09-08T18:00:00', '9/8'],
    ['a previous year', '2025-12-31T18:00:00', '2025/12/31'],
  ];
  for (const [label, sentAt, expected] of cases) {
    it(`${label} shows ${expected}`, () => {
      assert.equal(formatTalkTime(jst(sentAt).toISOString(), now), expected);
    });
  }

  it('is blank without a time', () => {
    assert.equal(formatTalkTime(null, now), '');
  });
});
