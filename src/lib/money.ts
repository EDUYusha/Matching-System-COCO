/**
 * Integer arithmetic helpers.
 *
 * Ruby's Integer#/ floors towards negative infinity and Integer#to_i truncates
 * towards zero. JavaScript's `/` does neither, so every ported credit
 * calculation goes through these rather than bare division — the accounting in
 * CalculateMeetingCosts, CastAttendance#earnings and the reward rules all
 * depend on matching Ruby exactly.
 */

/** Ruby `a / b` for Integers. */
export function idiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Ruby `Float#to_i` / `Integer#to_i` — truncate towards zero. */
export function toI(n: number): number {
  return Math.trunc(n);
}

/** Ruby `n.ceil(-3)` — round up to the next multiple of 1000. */
export function ceilTo1000(n: number): number {
  return Math.ceil(n / 1000) * 1000;
}

/** ApplicationHelper#number_to_credits → "1,234 P" */
export function numberToCredits(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0 P';
  return `${Math.trunc(n).toLocaleString('en-US')} P`;
}

/** ApplicationHelper#number_to_transferred_credits → "+1,234P" / "-1,234P" */
export function numberToTransferredCredits(n: number | null | undefined): string {
  const v = Math.trunc(n ?? 0);
  const sign = v < 0 ? '-' : '+';
  return `${sign}${Math.abs(v).toLocaleString('en-US')}P`;
}

/** yen formatting used on the payout and receipt screens */
export function numberToYen(n: number | null | undefined): string {
  return `${Math.trunc(n ?? 0).toLocaleString('en-US')}円`;
}

/**
 * Rails `number_to_currency(n, unit: 'P')` under the ja locale from rails-i18n,
 * which sets format "%n%u", precision 0 and a comma delimiter → "1,234P".
 * AutoSendMessage's templates use this form, which differs from
 * numberToCredits' "1,234 P" (that one passes an explicit format string).
 */
export function numberToCurrencyP(n: number | null | undefined): string {
  return `${Math.trunc(n ?? 0).toLocaleString('en-US')}P`;
}
