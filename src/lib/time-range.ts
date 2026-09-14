import { tokyoParts } from '@/lib/datetime';

/**
 * Port of server/lib/time_range.rb.
 *
 * A wall-clock interval such as 00:00–06:00 that may wrap past midnight. The
 * original exploits the fact that "HH:MM" strings sort alphabetically, and so
 * does this, so the edge-case behaviour matches exactly.
 *
 * Rails ran with config.time_zone = 'Tokyo', so a Time compared against this
 * interval was read as Tokyo wall-clock. A Date is therefore converted in Tokyo
 * here too, not in the host's zone — otherwise a 14:00 JST order would land
 * inside the 00:00-06:00 night window on a UTC server and be charged the night
 * surcharge.
 */
export class TimeRange {
  readonly start: string;
  readonly end: string;

  constructor(start: string | { start: string; end: string } | Date | number, end?: string | Date | number) {
    if (typeof start === 'object' && start !== null && !(start instanceof Date)) {
      this.start = TimeRange.coerce(start.start);
      this.end = TimeRange.coerce(start.end);
    } else {
      this.start = TimeRange.coerce(start);
      this.end = TimeRange.coerce(end!);
    }
  }

  static coerce(time: string | Date | number): string {
    if (typeof time === 'string') {
      if (/^\d\d?$/.test(time)) time = `${time}:00`;
      if (/^\d:\d\d$/.test(time)) return `0${time}`;
      if (/^\d\d:\d\d$/.test(time)) return time;
      throw new Error('No valid Time is given');
    }
    if (time instanceof Date) {
      const parts = tokyoParts(time);
      return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    }
    if (typeof time === 'number') return TimeRange.coerce(new Date(time * 1000));
    throw new Error('No valid Time is given');
  }

  includes(time: string | Date | number): boolean {
    const t = TimeRange.coerce(time);
    if (this.start < this.end) return this.start <= t && t <= this.end;
    // wrapping interval: everything except the complementary range
    return !(this.end <= t && t <= this.start);
  }

  /** Does this interval share at least one instant with [from, to]? */
  overlaps(from: string | Date | number, to: string | Date | number): boolean {
    const t1 = TimeRange.coerce(from);
    const t2 = TimeRange.coerce(to);
    // The queried interval itself wraps midnight: split it in two.
    if (t2 < t1) return this.overlaps('00:00', t2) || this.overlaps(t1, '23:59');

    if (this.start < this.end) return rangesOverlap(this.start, this.end, t1, t2);
    return rangesOverlap('00:00', this.end, t1, t2) || rangesOverlap(this.start, '23:59', t1, t2);
  }

  toJSON() {
    return { start: this.start, end: this.end };
  }
}

/** Ruby's Range#overlaps? on inclusive ranges. */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
