/**
 * Japanese date/time formatting, ported from config/locales/ja.yml.
 *
 * `I18n.l some_time` in the Rails views uses the ja `time.formats.default`, so
 * `l()` here produces the identical string. Everything works in Asia/Tokyo,
 * which is what the original app assumed throughout.
 */
export const TOKYO_TZ = 'Asia/Tokyo';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** Wall-clock parts of an instant as seen in Asia/Tokyo. */
export function tokyoParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TOKYO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** ja time.formats.default — "%Y年%m月%d日%H時%M分" */
export function l(date: Date | string | null | undefined): string {
  if (!date) return '時間不明';
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.year}年${p2(t.month)}月${p2(t.day)}日${p2(t.hour)}時${p2(t.minute)}分`;
}

/** ja date.formats.default — "%Y年%m月%d日" */
export function lDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.year}年${p2(t.month)}月${p2(t.day)}日`;
}

/** ja time.formats.daymonthweekday — "%m月%d日（%a）" */
export function lDayMonthWeekday(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${p2(t.month)}月${p2(t.day)}日（${WEEKDAYS_JA[t.weekday]}）`;
}

/** ja time.formats.hoursecond — "%H時%M分" */
export function lHourMinute(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${p2(t.hour)}時${p2(t.minute)}分`;
}

/** "%-m/%-d(%a)%H:%M", used in the order-finished messages. */
export function lShortWithWeekday(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.month}/${t.day}(${WEEKDAYS_JA[t.weekday]})${p2(t.hour)}:${p2(t.minute)}`;
}

/** "HH:MM" in Tokyo — the message bubble timestamp. */
export function lClock(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${p2(t.hour)}:${p2(t.minute)}`;
}

/** "%Y年%-m月%-d日" — payout scheduled date wording. */
export function lLooseDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.year}年${t.month}月${t.day}日`;
}

/** "YYYY/MM/DD", used for trial-point expiry wording. */
export function lSlashDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.year}/${p2(t.month)}/${p2(t.day)}`;
}

/** "YYYY-MM-DD" in Tokyo — used wherever the original compared `Date` values. */
export function isoDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = tokyoParts(d);
  return `${t.year}-${p2(t.month)}-${p2(t.day)}`;
}

/** User#age — whole years as of today, in Tokyo. */
export function ageFromBirthday(birthday: Date | string | null | undefined): number | null {
  if (!birthday) return null;
  const b = tokyoParts(typeof birthday === 'string' ? new Date(birthday) : birthday);
  const today = tokyoParts(new Date());
  let age = today.year - b.year;
  if (today.month < b.month || (today.month === b.month && today.day < b.day)) age -= 1;
  return age;
}

/** ProfilesHelper#display_age — "28歳" or "" */
export function displayAge(birthday: Date | string | null | undefined): string {
  const age = ageFromBirthday(birthday);
  return age === null ? '' : `${age}歳`;
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const secondsFromNow = (seconds: number): Date => new Date(Date.now() + seconds * 1000);
export const secondsAgo = (seconds: number): Date => new Date(Date.now() - seconds * 1000);
export const minutesFromNow = (minutes: number): Date => new Date(Date.now() + minutes * MINUTE);
export const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);

/** Start of the Tokyo day `date` falls in, as a UTC instant. */
export function tokyoStartOfDay(date: Date = new Date(), hour = 0): Date {
  const t = tokyoParts(date);
  return new Date(`${t.year}-${p2(t.month)}-${p2(t.day)}T${p2(hour)}:00:00+09:00`);
}

/** Start of the Tokyo month `date` falls in. */
export function tokyoStartOfMonth(date: Date = new Date(), hour = 0): Date {
  const t = tokyoParts(date);
  return new Date(`${t.year}-${p2(t.month)}-01T${p2(hour)}:00:00+09:00`);
}

export function tokyoStartOfYear(date: Date = new Date(), hour = 0): Date {
  const t = tokyoParts(date);
  return new Date(`${t.year}-01-01T${p2(hour)}:00:00+09:00`);
}

/** Same wall-clock time one month earlier (clamped like Ruby's prev_month). */
export function tokyoPrevMonth(date: Date = new Date()): Date {
  const t = tokyoParts(date);
  const year = t.month === 1 ? t.year - 1 : t.year;
  const month = t.month === 1 ? 12 : t.month - 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(t.day, lastDay);
  return new Date(`${year}-${p2(month)}-${p2(day)}T${p2(t.hour)}:${p2(t.minute)}:${p2(t.second)}+09:00`);
}

export function tokyoNextMonth(date: Date = new Date()): Date {
  const t = tokyoParts(date);
  const year = t.month === 12 ? t.year + 1 : t.year;
  const month = t.month === 12 ? 1 : t.month + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(t.day, lastDay);
  return new Date(`${year}-${p2(month)}-${p2(day)}T${p2(t.hour)}:${p2(t.minute)}:${p2(t.second)}+09:00`);
}

/** Ruby's Time#beginning_of_minute. */
export function beginningOfMinute(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

/** Ruby's beginning_of_quarter / end_of_quarter, in Tokyo. */
export function tokyoQuarterRange(date: Date = new Date()): { start: Date; end: Date } {
  const t = tokyoParts(date);
  const startMonth = Math.floor((t.month - 1) / 3) * 3 + 1;
  const start = new Date(`${t.year}-${p2(startMonth)}-01T00:00:00+09:00`);
  const endMonth = startMonth + 3;
  const endYear = endMonth > 12 ? t.year + 1 : t.year;
  const normalisedEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;
  const end = new Date(new Date(`${endYear}-${p2(normalisedEndMonth)}-01T00:00:00+09:00`).getTime() - 1);
  return { start, end };
}
