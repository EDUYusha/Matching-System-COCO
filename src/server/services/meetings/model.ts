import { Prisma } from '@prisma/client';
import type { CastAttendance, Meeting } from '@prisma/client';
import { config, idiv, l, TimeRange, tokyoStartOfDay } from '@/lib';
import { prisma, type Tx } from '@/server/lib/prisma';

/**
 * Port of the Meeting model's instance and scope methods.
 *
 * Kept as free functions over a plain row rather than methods on a class: the
 * service layer always has the row already loaded, and this keeps the integer
 * rounding visible at each call site.
 */

export type MeetingLike = Pick<
  Meeting,
  | 'id'
  | 'category'
  | 'status'
  | 'ownerId'
  | 'areaId'
  | 'areaName'
  | 'plannedStartTime'
  | 'plannedEndTime'
  | 'requestStartTime'
  | 'requestEndTime'
  | 'neededPersonCount'
  | 'minimumPersonCount'
  | 'baseCostPerTime'
  | 'prolongCostPerTime'
  | 'castRankId'
  | 'calculationSettings'
  | 'finalCosts'
  | 'finalDiscount'
  | 'frozenCredits'
> & {
  castRank?: { baseCostPerTime: number; prolongCostPerTime: number; fixedPrice: boolean } | null;
  area?: { name?: string | null; businessAreaId?: number | null } | null;
};

/**
 * The frozen surcharge/earning settings written at order creation
 * (Meeting#init_calculation_settings). Reading them back goes through this so a
 * missing key falls back to the live config, exactly as the Ruby `||` chains did.
 */
export interface CalculationSettings {
  night_surcharge?: number;
  night_interval?: { start: string; end: string };
  cast_selection_surcharge?: number;
  night_earnings_permille?: number | 'cast_dependent';
  selection_earnings_permille?: number | 'cast_dependent';
  /** set by the admin to skip the up-front charge */
  no_pre_charge?: boolean;
}

/** Meeting#init_calculation_settings — defaults merged under any provided values. */
export function initCalculationSettings(provided?: CalculationSettings | null): CalculationSettings {
  const defaults: CalculationSettings = {
    night_surcharge: config.night_surcharge,
    night_interval: config.night_interval.toJSON(),
    cast_selection_surcharge: config.cast_selection_surcharge,
    night_earnings_permille: config.night_earnings_permille,
    selection_earnings_permille: config.selection_earnings_permille,
  };
  if (!provided || Object.keys(provided).length === 0) return defaults;
  return { ...defaults, ...provided };
}

export function calculationSettings(meeting: { calculationSettings: unknown }): CalculationSettings {
  const raw = meeting.calculationSettings;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as CalculationSettings;
    } catch {
      return {};
    }
  }
  return raw as CalculationSettings;
}

export function nightIntervalFor(meeting: { calculationSettings: unknown }): TimeRange {
  const settings = calculationSettings(meeting);
  return settings.night_interval ? new TimeRange(settings.night_interval) : config.night_interval;
}

/** Meeting#planned_length — seconds. */
export function plannedLength(meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>): number {
  return Math.trunc((meeting.plannedEndTime.getTime() - meeting.plannedStartTime.getTime()) / 1000);
}

export function plannedLengthMinutes(meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>): number {
  return idiv(plannedLength(meeting), 60);
}

function baseCost(meeting: MeetingLike): number {
  return meeting.baseCostPerTime ?? meeting.castRank?.baseCostPerTime ?? 0;
}

/**
 * Meeting#estimated_costs_per_cast.
 *
 * Note the double integer division in the original:
 *   planned_length./(60)./(cost_time_interval)
 * so a 90 minute order at a 30 minute interval bills 3 intervals, and 89 minutes
 * still bills only 2. Both divisions floor.
 */
export function estimatedCostsPerCast(meeting: MeetingLike): number {
  if (meeting.castRank?.fixedPrice) return baseCost(meeting);
  const intervals = idiv(idiv(plannedLength(meeting), 60), config.cost_time_interval);
  return baseCost(meeting) * intervals;
}

/** Meeting#estimated_night_surcharge */
export function estimatedNightSurcharge(meeting: MeetingLike): number {
  if (meeting.category === 'individual') return 0;
  if (meeting.castRank?.fixedPrice) return 0;
  const interval = nightIntervalFor(meeting);
  const settings = calculationSettings(meeting);
  const surcharge = interval.overlaps(meeting.plannedStartTime, meeting.plannedEndTime)
    ? (settings.night_surcharge ?? config.night_surcharge)
    : 0;
  return surcharge * meeting.neededPersonCount;
}

/** Meeting#estimated_costs */
export function estimatedCosts(meeting: MeetingLike, options: { withNightSurcharge?: boolean } = {}): number {
  let costs = meeting.neededPersonCount * estimatedCostsPerCast(meeting);
  if (options.withNightSurcharge) costs += estimatedNightSurcharge(meeting);
  if (costs < 0) costs = 0;
  return costs;
}

/** Meeting#area_name — the stored snapshot wins over the area's current name. */
export function meetingAreaName(meeting: MeetingLike): string {
  return meeting.areaName || meeting.area?.name || '';
}

/** Meeting#summary — also the title of the group chat room. */
export function meetingSummary(meeting: MeetingLike): string {
  return `合流: ${meetingAreaName(meeting)}\n${l(meeting.plannedStartTime)} キャスト${meeting.neededPersonCount}人`;
}

/**
 * Meeting#virtual_planned_end_time_for — the end time this particular cast is
 * billed against. A late arrival pushes the end out by the same amount; an early
 * arrival pulls it in when costs_for_being_early is on.
 */
export function virtualPlannedEndTimeFor(
  meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>,
  attendance: Pick<CastAttendance, 'startTime'>,
): Date {
  const start = attendance.startTime;
  if (!start) return meeting.plannedEndTime;

  if (config.only_consider_attendance_time_spans_for_costs) {
    return new Date(start.getTime() + plannedLength(meeting) * 1000);
  }
  if (start.getTime() > meeting.plannedStartTime.getTime()) {
    return new Date(meeting.plannedEndTime.getTime() + (start.getTime() - meeting.plannedStartTime.getTime()));
  }
  if (config.costs_for_being_early && start.getTime() < meeting.plannedStartTime.getTime()) {
    return new Date(meeting.plannedEndTime.getTime() - (meeting.plannedStartTime.getTime() - start.getTime()));
  }
  return meeting.plannedEndTime;
}

/** Meeting#exclusive_time — the window in which a cast cannot take another order. */
export function exclusiveTime(meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>): {
  from: Date;
  to: Date;
} {
  return {
    from: meeting.plannedStartTime,
    to: new Date(meeting.plannedEndTime.getTime() + config.cast_attendance_blocking_period * 1000),
  };
}

/** Meeting#set_final_costs — a discount may never exceed the costs it discounts. */
export function finalCostsUpdate(meeting: Pick<MeetingLike, 'finalDiscount'>, costs: number) {
  return {
    finalCosts: costs,
    ...(meeting.finalDiscount > costs ? { finalDiscount: costs } : {}),
  };
}

/** Meeting#participant? */
export function isParticipant(
  meeting: { ownerId: number },
  attendances: Array<Pick<CastAttendance, 'userId' | 'role'>>,
  userId: number,
): boolean {
  if (userId === meeting.ownerId) return true;
  return attendances.some((attendance) => attendance.role !== 'out' && attendance.userId === userId);
}

/**
 * Meeting.available_for — which orders a user may see in the order list.
 *
 * For cast, the window deliberately reaches back a week
 * (`Date.yesterday - 6.days < request_end_time`) so they can review orders they
 * missed, and forward only to orders whose recruitment has actually opened.
 */
export function availableForWhere(
  user: { userType: string; businessAreaId: number | null; castLevelId: number | null },
  options: { blockedIds?: number[] } = {},
): Prisma.MeetingWhereInput | null {
  const now = new Date();

  if (user.userType === 'admin' || user.userType === 'system') {
    return { requestStartTime: { lte: now }, requestEndTime: { gte: now } };
  }

  if (user.userType === 'operator') {
    return {
      area: { businessAreaId: user.businessAreaId ?? -1 },
      requestStartTime: { lte: now },
      requestEndTime: { gte: now },
    };
  }

  if (user.userType === 'cast') {
    // Date.yesterday - 6.days, i.e. the start of the Tokyo day one week back
    const oneWeekBack = new Date(tokyoStartOfDay(now).getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      area: { businessAreaId: user.businessAreaId ?? -1 },
      castRank: user.castLevelId
        ? { castLevels: { some: { castLevelId: user.castLevelId } } }
        : { castLevels: { some: {} } },
      requestStartTime: { lt: now },
      requestEndTime: { gt: oneWeekBack },
      ...(options.blockedIds?.length ? { ownerId: { notIn: options.blockedIds } } : {}),
    };
  }

  return null;
}

/**
 * Meeting.order_by_joinability — live orders first by soonest start, finished
 * ones after them by most recent start. The original did this with a MySQL
 * `IF(...)` over UNIX_TIMESTAMP; this is the Postgres equivalent.
 */
export const ORDER_BY_JOINABILITY = Prisma.sql`
  CASE WHEN status IN ('requested', 'cast_requested', 'cast_selectable')
    THEN EXTRACT(EPOCH FROM planned_start_time)
    ELSE 5000000000 - EXTRACT(EPOCH FROM planned_start_time)
  END ASC
`;

/** Meeting#potential_cast — everyone eligible for this order's rank and branch. */
export async function potentialCast(meetingId: number, tx?: Tx) {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { castRankId: true, area: { select: { businessAreaId: true } } },
  });
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return client.user.findMany({
    where: {
      discardedAt: null,
      businessAreaId: meeting.area.businessAreaId,
      lastActivity: { gte: threeMonthsAgo },
      castLevel: meeting.castRankId
        ? { castRanks: { some: { castRankId: meeting.castRankId } } }
        : { castRanks: { some: {} } },
    },
    select: { id: true, snsId: true, deviceIds: true, userType: true },
  });
}

/** Meeting#available_cast — potential cast who flagged themselves available today. */
export async function availableCast(meetingId: number, tx?: Tx) {
  const client = tx ?? prisma;
  const meeting = await client.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    select: { castRankId: true, area: { select: { businessAreaId: true } } },
  });
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return client.user.findMany({
    where: {
      discardedAt: null,
      userType: 'cast',
      availableUntil: { gt: new Date() },
      businessAreaId: meeting.area.businessAreaId,
      lastActivity: { gte: threeMonthsAgo },
      castLevel: meeting.castRankId
        ? { castRanks: { some: { castRankId: meeting.castRankId } } }
        : { castRanks: { some: {} } },
    },
    select: { id: true, snsId: true, deviceIds: true, userType: true },
  });
}

/**
 * CastAttendance#parallel_attendances — other live orders whose time overlaps
 * this one's blocking window, which is what stops double-booking a cast.
 */
export async function parallelAttendances(
  attendance: { userId: number; meetingId: number },
  meeting: Pick<MeetingLike, 'plannedStartTime' | 'plannedEndTime'>,
  tx?: Tx,
) {
  const client = tx ?? prisma;
  const { from, to } = exclusiveTime(meeting);
  return client.castAttendance.findMany({
    where: {
      userId: attendance.userId,
      role: { not: 'out' },
      meetingId: { not: attendance.meetingId },
      meeting: {
        status: { in: ['requested', 'cast_selectable', 'scheduled', 'in_progress'] },
        OR: [
          { plannedStartTime: { gte: from, lte: to } },
          { plannedEndTime: { gte: from, lte: to } },
        ],
      },
    },
    include: { meeting: { select: { id: true, plannedStartTime: true, plannedEndTime: true } } },
  });
}

/** Meeting#record_costs (before_create) — snapshot the rank's prices. */
export function recordCosts(
  input: { baseCostPerTime?: number | null; prolongCostPerTime?: number | null },
  castRank: { baseCostPerTime: number; prolongCostPerTime: number } | null,
): { baseCostPerTime: number | null; prolongCostPerTime: number | null } {
  if (!castRank) {
    return { baseCostPerTime: input.baseCostPerTime ?? null, prolongCostPerTime: input.prolongCostPerTime ?? null };
  }
  return {
    baseCostPerTime: input.baseCostPerTime ?? castRank.baseCostPerTime,
    prolongCostPerTime: input.prolongCostPerTime ?? castRank.prolongCostPerTime,
  };
}

/** Meeting validations: start_before_end and general_meeting_has_cast_rank. */
export function validateMeeting(input: {
  plannedStartTime: Date;
  plannedEndTime: Date;
  requestStartTime?: Date | null;
  requestEndTime?: Date | null;
  category: string;
  castRankId?: number | null;
}): string[] {
  const errors: string[] = [];
  if (input.plannedStartTime.getTime() >= input.plannedEndTime.getTime()) {
    errors.push('Planned end time must be after planned_start_time');
  }
  if (
    input.requestStartTime &&
    input.requestEndTime &&
    input.requestStartTime.getTime() >= input.requestEndTime.getTime()
  ) {
    errors.push('Request end time must be after request_start_time');
  }
  if (input.category === 'general' && !input.castRankId) {
    errors.push('Cast rank is needed for general meetings');
  }
  return errors;
}
