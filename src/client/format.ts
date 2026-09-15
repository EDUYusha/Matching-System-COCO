export {
  ageFromBirthday,
  displayAge,
  l,
  lClock,
  lDate,
  lDayMonthWeekday,
  lHourMinute,
  lLooseDate,
  lShortWithWeekday,
  lSlashDate,
  numberToCredits,
  numberToCurrencyP,
  numberToTransferredCredits,
  numberToYen,
  tokyoParts,
} from '@/lib';

/** "3時間30分" for a duration given in minutes, as the order screens show it. */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分`;
  if (rest === 0) return `${hours}時間`;
  return `${hours}時間${rest}分`;
}

/** Relative wording the chat list uses for the last message time. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(
    new Date(iso),
  );
}

/**
 * The talk list's timestamp, as LINE shows it: the clock time today, 昨日 for
 * yesterday, the weekday within the past week, and the date before that (with
 * the year once it is a different year). Days are counted in Tokyo time.
 */
export function formatTalkTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const tokyo = (options: Intl.DateTimeFormatOptions, value: Date): string =>
    new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', ...options }).format(value);
  // en-CA formats as YYYY-MM-DD, which Date.parse reads as UTC midnight
  const dayKey = (value: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(value);
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(date))) / 86_400_000);

  if (days <= 0) return tokyo({ hour: 'numeric', minute: '2-digit' }, date);
  if (days === 1) return '昨日';
  if (days < 7) return tokyo({ weekday: 'long' }, date);
  if (dayKey(now).slice(0, 4) !== dayKey(date).slice(0, 4)) {
    return tokyo({ year: 'numeric', month: 'numeric', day: 'numeric' }, date);
  }
  return tokyo({ month: 'numeric', day: 'numeric' }, date);
}

/** The countdown the recruitment list shows against request_end_time. */
export function formatCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const remaining = new Date(iso).getTime() - Date.now();
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 60) return `残り${minutes}分`;
  const hours = Math.floor(minutes / 60);
  return `残り${hours}時間${minutes % 60}分`;
}
