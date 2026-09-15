import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { setUpMeeting } from '@/server/services/meetings/setup';
import { prepareMeetingFinances } from '@/server/services/meetings/finances';
import { initCalculationSettings } from '@/server/services/meetings/model';
import { jsonBody, route } from '@/server/http/route';
import { meetingParamsSchema } from '@/server/api/internal-api-shared';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings */
export const POST = route(async (request) => {
  const body = z
    .object({
      meeting: meetingParamsSchema,
      no_pre_charge: z.string().optional(),
      notify_cast: z.string().optional().nullable(),
      notify_customer: z.string().optional(),
    })
    .parse(await jsonBody(request));

  // numeric strings in calculation_settings are coerced, as the original did
  const settings: Record<string, unknown> = { ...(body.meeting.calculation_settings ?? {}) };
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) settings[key] = Number(value);
  }
  if (body.no_pre_charge === '1') settings.no_pre_charge = true;

  const meeting = await prisma.meeting.create({
    data: {
      status: body.meeting.status as never,
      category: (body.meeting.category ?? 'general') as never,
      ownerId: body.meeting.owner_id,
      areaId: body.meeting.area_id,
      areaName: body.meeting.area_name ?? null,
      castRankId: body.meeting.cast_rank_id ?? null,
      neededPersonCount: body.meeting.needed_person_count,
      description: body.meeting.description ?? null,
      operatorMessage: body.meeting.operator_message ?? null,
      requestStartTime: body.meeting.request_start_time ? new Date(body.meeting.request_start_time) : null,
      requestEndTime: body.meeting.request_end_time ? new Date(body.meeting.request_end_time) : null,
      plannedStartTime: new Date(body.meeting.planned_start_time),
      plannedEndTime: new Date(body.meeting.planned_end_time),
      baseCostPerTime: body.meeting.base_cost_per_time ?? null,
      prolongCostPerTime: body.meeting.prolong_cost_per_time ?? null,
      preferences: body.meeting.preferences ?? [],
      calculationSettings: initCalculationSettings(settings) as unknown as Prisma.InputJsonValue,
    },
  });

  if (meeting.status === 'requested') {
    await setUpMeeting(meeting.id, {
      castNotification: body.notify_cast ?? null,
      noCustomerNotification: body.notify_customer !== '1',
    });
  } else if (meeting.status === 'scheduled') {
    await prepareMeetingFinances(meeting.id);
  }

  return { ok: true, meetingId: meeting.id };
});
