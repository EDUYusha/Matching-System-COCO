import type { CastAttendance } from '@prisma/client';
import { config, idiv, MeetingCosts, MeetingCostsEntry, toI, TimeRange, type CostType } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';
import {
  calculationSettings,
  plannedLength,
  virtualPlannedEndTimeFor,
  type MeetingLike,
} from '@/server/services/meetings/model';

/**
 * Port of CalculateMeetingCosts and CastAttendance#earnings — the accounting core.
 *
 * Billing logic, from the original's own comment:
 *   cast is paid only for fully participated intervals;
 *   participation before the planned start time is not accounted;
 *   if cast is delayed, the planned end time delays too;
 *   if cast is delayed and the order ends on time, the delayed time is unpaid.
 *
 * Every division below mirrors Ruby's: Integer#/ floors and Float#to_i
 * truncates, which is why these go through idiv/toI rather than plain `/`.
 */

const CHARGE_INTERVAL = config.cost_time_interval; // 30 minutes
const MIN_INTERVAL = idiv(CHARGE_INTERVAL, config.cost_time_interval_divider); // 5 minutes

type AttendanceForCosts = Pick<CastAttendance, 'id' | 'startTime' | 'endTime' | 'decisionBy' | 'serviceFeePermille'> & {
  user?: { serviceFeePermille: number | null } | null;
};

function seconds(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 1000;
}

/** The per-attendance bucket amounts; `{}` when the cast never started or finished. */
function charges(
  meeting: MeetingLike,
  attendance: AttendanceForCosts,
  options: { noSurcharges?: boolean } = {},
): Partial<Record<CostType, number>> {
  if (!attendance.startTime || !attendance.endTime) return {};

  const settings = calculationSettings(meeting);
  const fixedPrice = !!meeting.castRank?.fixedPrice;

  let baseAttendanceTime: number;
  let prolongAttendanceTime: number;

  if (config.only_consider_attendance_time_spans_for_costs) {
    // the real start and end times do not matter, only how long the cast stayed
    const attendanceTime = seconds(attendance.startTime, attendance.endTime);
    const estimatedTime = plannedLength(meeting);

    if (attendanceTime > estimatedTime) {
      baseAttendanceTime = estimatedTime;
      prolongAttendanceTime = attendanceTime - estimatedTime;
    } else {
      baseAttendanceTime = config.estimated_costs_are_lower_bound ? estimatedTime : attendanceTime;
      prolongAttendanceTime = 0;
    }
  } else {
    // timing is critical: arriving early earns nothing, arriving late reduces pay
    const virtualPlannedEndTime = virtualPlannedEndTimeFor(meeting, attendance);

    if (attendance.endTime.getTime() >= virtualPlannedEndTime.getTime() + MIN_INTERVAL * 60 * 1000) {
      // the order ran into its prolong phase
      baseAttendanceTime = plannedLength(meeting);
      prolongAttendanceTime = seconds(virtualPlannedEndTime, attendance.endTime);
    } else {
      // always paid up to the planned end; a late arrival shortens the paid span
      const end = Math.max(meeting.plannedEndTime.getTime(), attendance.endTime.getTime());
      const start = Math.max(meeting.plannedStartTime.getTime(), attendance.startTime.getTime());
      baseAttendanceTime = (end - start) / 1000;
      prolongAttendanceTime = 0;
    }
  }

  let baseCharge: number;
  let prolongCharge: number;

  if (fixedPrice) {
    baseCharge = meeting.baseCostPerTime ?? meeting.castRank?.baseCostPerTime ?? 0;
    prolongCharge = 0;
  } else {
    // Order matters for the rounding: truncate to seconds, floor to minutes,
    // floor to min_interval blocks, then scale to charge intervals as a float.
    const baseBlocks = idiv(idiv(toI(baseAttendanceTime), 60), MIN_INTERVAL);
    const prolongBlocks = idiv(idiv(toI(prolongAttendanceTime), 60), MIN_INTERVAL);
    baseCharge = toI((baseBlocks / config.cost_time_interval_divider) * (meeting.baseCostPerTime ?? 0));
    prolongCharge = toI((prolongBlocks / config.cost_time_interval_divider) * (meeting.prolongCostPerTime ?? 0));
  }

  if (meeting.category === 'individual' || options.noSurcharges) {
    return { base: baseCharge, prolong: prolongCharge };
  }

  const nightInterval = settings.night_interval ? new TimeRange(settings.night_interval) : config.night_interval;
  const nightSurcharge =
    !fixedPrice && nightInterval.overlaps(attendance.startTime, attendance.endTime)
      ? (settings.night_surcharge ?? config.night_surcharge)
      : 0;

  // only charged when the guest hand-picked this cast on a group order
  const castSelectionSurcharge =
    attendance.decisionBy === 'customer' && meeting.category === 'general'
      ? (settings.cast_selection_surcharge ?? config.cast_selection_surcharge)
      : 0;

  return {
    base: baseCharge,
    prolong: prolongCharge,
    night: nightSurcharge,
    selection: castSelectionSurcharge,
  };
}

/** CalculateMeetingCosts — costs for every active attendance on the order. */
export async function calculateMeetingCosts(
  meetingId: number,
  options: { noSurcharges?: boolean } = {},
  tx?: Tx,
): Promise<MeetingCosts> {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { castRank: true, area: true },
  });
  const attendances = await client.castAttendance.findMany({
    where: { meetingId, role: { not: 'out' } },
    include: { user: { select: { serviceFeePermille: true } } },
  });

  return calculateCostsFor(meeting as MeetingLike, attendances, options);
}

/** Same calculation against rows the caller already loaded. */
export function calculateCostsFor(
  meeting: MeetingLike,
  attendances: AttendanceForCosts[],
  options: { noSurcharges?: boolean } = {},
): MeetingCosts {
  const costs = new MeetingCosts();
  for (const attendance of attendances) {
    costs.add(attendance.id, charges(meeting, attendance, options));
  }
  return costs;
}

/** User#earnings — the cast's cut of a paid amount, floored. */
function userEarnings(paidPrice: number, serviceFeePermille: number | null | undefined): number {
  if (serviceFeePermille === null || serviceFeePermille === undefined) return 0;
  return idiv(toI(paidPrice) * serviceFeePermille, 1000);
}

/**
 * CastAttendance#earnings.
 *
 * Each bucket has its own rule. base and prolong use the attendance's frozen
 * service_fee_permille, falling back to the cast's current one. night and
 * selection use their configured permille, where the literal 'cast_dependent'
 * means "treat it like base", i.e. apply the cast's own rate.
 *
 * Only buckets with a positive amount contribute, matching the original's
 * `select { |k,_| my_paid_costs.public_send(k) > 0 }`.
 */
export function attendanceEarnings(
  meeting: { calculationSettings: unknown },
  attendance: AttendanceForCosts,
  paidCosts: MeetingCostsEntry,
  options: { only?: CostType[] } = {},
): number {
  const settings = calculationSettings(meeting);
  const feePermille = attendance.serviceFeePermille;
  const castRate = feePermille ?? attendance.user?.serviceFeePermille ?? null;

  const byCastRate = (amount: number): number =>
    feePermille === null || feePermille === undefined
      ? userEarnings(amount, attendance.user?.serviceFeePermille ?? null)
      : idiv(amount * feePermille, 1000);

  const logic: Record<CostType, () => number> = {
    base: () => byCastRate(paidCosts.base),
    prolong: () => byCastRate(paidCosts.prolong),
    night: () => {
      const permille = settings.night_earnings_permille ?? config.night_earnings_permille;
      if (permille === 'cast_dependent') return byCastRate(paidCosts.night);
      return idiv(paidCosts.night * permille, 1000);
    },
    selection: () => {
      const permille = settings.selection_earnings_permille ?? config.selection_earnings_permille;
      if (permille === 'cast_dependent') return byCastRate(paidCosts.selection);
      return idiv(paidCosts.selection * permille, 1000);
    },
  };

  void castRate; // kept for readability of the rule above

  const types: CostType[] = options.only ?? (['base', 'prolong', 'night', 'selection'] as CostType[]);
  return types
    .filter((type) => paidCosts.get(type) > 0)
    .reduce((sum, type) => sum + logic[type](), 0);
}

// --- attendance length helpers (display only, never accounting) ------------

/** CastAttendance#real_attendance_length — seconds actually present. */
export function realAttendanceLength(attendance: Pick<CastAttendance, 'startTime' | 'endTime'>): number {
  if (!attendance.startTime || !attendance.endTime) return 0;
  return seconds(attendance.startTime, attendance.endTime);
}

/** CastAttendance#base_attendance_length */
export function baseAttendanceLength(
  meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>,
  attendance: Pick<CastAttendance, 'startTime' | 'endTime'>,
): number {
  if (!attendance.startTime || !attendance.endTime) return 0;
  const virtualEnd = virtualPlannedEndTimeFor(meeting, attendance);
  if (attendance.endTime.getTime() > virtualEnd.getTime()) return plannedLength(meeting);
  return seconds(attendance.startTime, attendance.endTime);
}

/** CastAttendance#prolong_attendance_length */
export function prolongAttendanceLength(
  meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>,
  attendance: Pick<CastAttendance, 'startTime' | 'endTime'>,
): number {
  if (!attendance.startTime || !attendance.endTime) return 0;
  const virtualEnd = virtualPlannedEndTimeFor(meeting, attendance);
  if (attendance.endTime.getTime() > virtualEnd.getTime()) {
    return seconds(virtualEnd, attendance.endTime);
  }
  return 0;
}

/** CastAttendance#summed_attendance_length */
export function summedAttendanceLength(
  meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>,
  attendance: Pick<CastAttendance, 'startTime' | 'endTime'>,
): number {
  return baseAttendanceLength(meeting, attendance) + prolongAttendanceLength(meeting, attendance);
}

export { MIN_INTERVAL, CHARGE_INTERVAL };
