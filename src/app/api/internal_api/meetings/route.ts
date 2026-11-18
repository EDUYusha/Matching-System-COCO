import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { setUpMeeting } from '@/server/services/meetings/setup';
import { prepareMeetingFinances } from '@/server/services/meetings/finances';
import { initCalculationSettings } from '@/server/services/meetings/model';
import {
  asParams,
  railsFlag,
  railsFullMessage,
  railsPresence,
  railsToInt,
  railsToTime,
  requestParams,
} from '@/server/http/params';
import {
  internalApiRoute,
  railsServerError,
  RailsParameterMissing,
} from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

/**
 * internal-api: POST /internal_api/meetings
 *
 * The panel posts this as `meeting[...]` form fields. Nothing is rejected with a
 * 422: a missing `meeting` group was `params.require`'s 400, and anything the
 * model refused came back as a 500 whose `error` is the array of
 * `errors.full_messages` — which is what the panel's advance() reads.
 */
export const POST = internalApiRoute(async (request) => {
  const body = await requestParams(request);
  if (body.meeting === undefined) throw new RailsParameterMissing('meeting');
  const given = asParams(body.meeting);

  const optionalInt = (key: string): number | null =>
    railsPresence(given[key]) === null ? null : railsToInt(given[key]);

  const status = railsPresence(given.status);
  const ownerId = optionalInt('owner_id');
  const areaId = optionalInt('area_id');
  const neededPersonCount = optionalInt('needed_person_count');
  const plannedStartTime = railsToTime(given.planned_start_time);
  const plannedEndTime = railsToTime(given.planned_end_time);

  // the model's own presence validations, collected as Rails collected them
  const errors: string[] = [];
  const blank = 'を入力してください';
  if (status === null) errors.push(railsFullMessage('status', blank));
  if (ownerId === null) errors.push(railsFullMessage('owner_id', blank));
  if (areaId === null) errors.push(railsFullMessage('area_id', blank));
  if (neededPersonCount === null) errors.push(railsFullMessage('needed_person_count', blank));
  if (plannedStartTime === null) errors.push(railsFullMessage('planned_start_time', blank));
  if (plannedEndTime === null) errors.push(railsFullMessage('planned_end_time', blank));
  if (errors.length) throw railsServerError(errors);

  // numeric strings in calculation_settings are coerced, as the original did
  const settings: Record<string, unknown> = { ...asParams(given.calculation_settings) };
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) settings[key] = Number(value);
  }
  if (railsFlag(body.no_pre_charge)) settings.no_pre_charge = true;

  const preferencesParam = given.preferences;
  const preferences = Array.isArray(preferencesParam)
    ? preferencesParam.map((value) => railsToInt(value))
    : railsPresence(preferencesParam) === null
      ? []
      : [railsToInt(preferencesParam)];

  const meeting = await prisma.meeting.create({
    data: {
      status: status as never,
      category: (railsPresence(given.category) ?? 'general') as never,
      ownerId: ownerId as number,
      areaId: areaId as number,
      areaName: railsPresence(given.area_name),
      castRankId: optionalInt('cast_rank_id'),
      neededPersonCount: neededPersonCount as number,
      description: railsPresence(given.description),
      operatorMessage: railsPresence(given.operator_message),
      requestStartTime: railsToTime(given.request_start_time),
      requestEndTime: railsToTime(given.request_end_time),
      // the presence check above has already rejected a blank or unparseable one
      plannedStartTime: plannedStartTime as Date,
      plannedEndTime: plannedEndTime as Date,
      baseCostPerTime: optionalInt('base_cost_per_time'),
      prolongCostPerTime: optionalInt('prolong_cost_per_time'),
      preferences,
      calculationSettings: initCalculationSettings(settings) as unknown as Prisma.InputJsonValue,
    },
  });

  if (meeting.status === 'requested') {
    await setUpMeeting(meeting.id, {
      castNotification: railsPresence(body.notify_cast),
      noCustomerNotification: !railsFlag(body.notify_customer),
    });
  } else if (meeting.status === 'scheduled') {
    await prepareMeetingFinances(meeting.id);
  }
});
