import { z } from 'zod';
import { beginningOfMinute, config, idiv } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { ValidationError } from '@/server/lib/errors';
import { initCalculationSettings, recordCosts, validateMeeting } from '@/server/services/meetings/model';

/**
 * Ports app/forms: OrderForm, IndividualOrderForm and OrderRequestForm.
 *
 * These were ActiveModel form objects that validated the order wizard's input and
 * then built an unsaved Meeting. Same split here: a zod schema for shape, a
 * validate function for the cross-field rules, and a build function producing the
 * Prisma create input.
 */

// --- OrderForm (group order) ----------------------------------------------

export const orderFormSchema = z.object({
  businessAreaId: z.coerce.number().int().positive(),
  areaId: z.coerce.number().int().positive(),
  areaName: z.string().optional().nullable(),
  neededPersonCount: z.coerce.number().int().positive(),
  minimumPersonCount: z.coerce.number().int().optional().nullable(),
  castRankId: z.coerce.number().int().positive(),
  timeSpan: z.coerce.number().int(),
  startTime: z.string().optional().nullable(),
  startTimeDelay: z.coerce.number().int().optional().nullable(),
  proposedPrice: z.coerce.number().int().optional().nullable(),
  description: z.string().optional().nullable(),
  meetingPrefs: z.array(z.coerce.number().int()).optional(),
  anonymous: z.coerce.boolean().optional(),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;

export interface NormalisedOrderForm extends OrderFormInput {
  startTimeParsed: Date | null;
  computedStartTime: Date;
  minimumPersonCount: number | null;
  meetingPrefs: number[];
  proposedPrice: number | null;
}

/**
 * OrderForm#initialize — the coercions the form did before validating.
 * minimum_person_count is dropped when it equals the needed count or when the
 * feature is off, because then it carries no information.
 */
export function normaliseOrderForm(input: OrderFormInput): NormalisedOrderForm {
  let minimumPersonCount = input.minimumPersonCount ?? 0;
  if (
    minimumPersonCount === 0 ||
    minimumPersonCount === input.neededPersonCount ||
    !config.minimal_cast_selection
  ) {
    minimumPersonCount = 0;
  }

  const startTimeParsed = input.startTime ? new Date(input.startTime) : null;
  // an explicit time wins over a relative delay
  const startTimeDelay = startTimeParsed ? null : (input.startTimeDelay ?? null);

  const computedStartTime = beginningOfMinute(
    startTimeParsed ?? new Date(Date.now() + (startTimeDelay ?? 0) * 60 * 1000),
  );

  return {
    ...input,
    startTimeParsed,
    startTimeDelay,
    computedStartTime,
    minimumPersonCount: minimumPersonCount || null,
    meetingPrefs: (input.meetingPrefs ?? []).filter((id) => Number.isFinite(id)),
    proposedPrice: input.proposedPrice || null,
    anonymous: input.anonymous ?? false,
  };
}

export async function validateOrderForm(form: NormalisedOrderForm): Promise<void> {
  const errors: Record<string, string[]> = {};
  const add = (field: string, message: string) => {
    errors[field] = errors[field] ?? [];
    errors[field].push(message);
  };

  if (form.minimumPersonCount !== null && form.minimumPersonCount > form.neededPersonCount) {
    add('minimum_person_count', 'は募集人数以下にしてください');
  }
  if (form.startTimeDelay !== null && form.startTimeDelay !== undefined) {
    if (form.startTimeDelay < config.min_meeting_delay || form.startTimeDelay > 120) {
      add('start_time_delay', `は${config.min_meeting_delay}から120の間で入力してください`);
    }
  }
  if (form.timeSpan < 60) add('time_span', 'は60以上で入力してください');

  // start_time_or_delay_present
  if (!form.startTimeParsed && (form.startTimeDelay === null || form.startTimeDelay === undefined)) {
    add('start_time_delay', '日時を選択して下さい。');
  } else if (
    form.startTimeParsed &&
    form.startTimeParsed.getTime() < Date.now() + (config.min_meeting_delay - 1) * 60 * 1000
  ) {
    add('start_time', `現在の時刻より${config.min_meeting_delay}分後以降で開始時刻を指定して下さい。`);
  }

  // price_proposition_min_amount_check
  const castRank = await prisma.castRank.findUnique({ where: { id: form.castRankId } });
  if (!castRank) {
    add('cast_rank_id', 'が見つかりません');
  } else if (form.proposedPrice !== null) {
    if (!castRank.proposedPrice) {
      // silently ignore uncleared input, as the original did
      form.proposedPrice = null;
    } else if (form.proposedPrice < castRank.baseCostPerTime) {
      add('proposed_price', `最低でも${castRank.baseCostPerTime}ポイントで設定してください。`);
    }
  }

  if (Object.keys(errors).length) {
    throw new ValidationError(
      Object.entries(errors)
        .flatMap(([field, messages]) =>
          // Rails-style fragments ("は60以上…") need the attribute in front; the
          // full sentences ("現在の時刻より…") are shown as written
          messages.map((message) => (/^[はが]/.test(message) ? `${field} ${message}` : message)),
        )
        .join('\n'),
      errors,
    );
  }
}

/** OrderForm#to_meeting */
export async function buildGroupMeeting(form: NormalisedOrderForm, ownerId: number) {
  const castRank = await prisma.castRank.findUniqueOrThrow({ where: { id: form.castRankId } });

  const plannedStartTime = form.computedStartTime;
  const plannedEndTime = new Date(plannedStartTime.getTime() + form.timeSpan * 60 * 1000);

  const costs = recordCosts(
    {
      baseCostPerTime: form.proposedPrice ?? castRank.baseCostPerTime,
      prolongCostPerTime:
        form.proposedPrice !== null
          ? idiv(form.proposedPrice * config.individual_meeting_prolong_multiplier_permille, 1000)
          : castRank.prolongCostPerTime,
    },
    castRank,
  );

  const validationErrors = validateMeeting({
    plannedStartTime,
    plannedEndTime,
    category: 'general',
    castRankId: form.castRankId,
  });
  if (validationErrors.length) throw new ValidationError(validationErrors.join('\n'));

  return {
    areaId: form.areaId,
    areaName: form.areaName ?? null,
    neededPersonCount: form.neededPersonCount,
    minimumPersonCount: form.minimumPersonCount,
    plannedStartTime,
    plannedEndTime,
    description: form.description ?? null,
    preferences: form.meetingPrefs,
    castRankId: form.castRankId,
    baseCostPerTime: costs.baseCostPerTime,
    prolongCostPerTime: costs.prolongCostPerTime,
    status: 'requested' as const,
    category: 'general' as const,
    ownerId,
    anonymous: form.anonymous ?? false,
    calculationSettings: initCalculationSettings(),
  };
}

// --- IndividualOrderForm (guest asks one cast) -----------------------------

export const individualOrderFormSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  timeSpan: z.coerce.number().int(),
  startTime: z.string(),
  areaId: z.coerce.number().int(),
  areaName: z.string().optional().nullable(),
});

export type IndividualOrderFormInput = z.infer<typeof individualOrderFormSchema>;

/**
 * BaseOrderForm#prepare_conversation_and_users — the private room identifies the
 * other party, so only one of owner/cast ever needs to be supplied.
 */
export async function resolveConversationParties(
  conversationId: number,
  knownUserId: number,
): Promise<{ conversationId: number; partnerId: number }> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, category: 'private' },
    include: { speakers: true },
  });
  if (!conversation) throw new ValidationError('conversation を入力してください');

  const me = conversation.speakers.find((speaker) => speaker.userId === knownUserId);
  if (!me) throw new ValidationError('Owner is not part of this conversation');

  const partner = conversation.speakers.find((speaker) => speaker.userId !== knownUserId);
  if (!partner) throw new ValidationError('Cast is not part of this conversation');

  return { conversationId: conversation.id, partnerId: partner.userId };
}

/** BaseOrderForm#correct_start_time */
function validateStartTime(startTime: Date): void {
  if (Number.isNaN(startTime.getTime())) throw new ValidationError('日時を選択して下さい。');
  if (startTime.getTime() < Date.now() + 60 * 1000) {
    throw new ValidationError('現在の時刻より1分後以降で開始時刻を指定して下さい。');
  }
}

/** IndividualOrderForm#to_meeting */
export async function buildIndividualMeeting(
  form: IndividualOrderFormInput,
  ownerId: number,
): Promise<{ meeting: Record<string, unknown>; castId: number }> {
  if (form.timeSpan < 60) throw new ValidationError('時間を選択してください。');

  const { partnerId } = await resolveConversationParties(form.conversationId, ownerId);
  const cast = await prisma.user.findUniqueOrThrow({ where: { id: partnerId } });
  if (cast.userType !== 'cast') throw new ValidationError('cast must be user type cast');

  const startTime = beginningOfMinute(new Date(form.startTime));
  validateStartTime(startTime);

  return {
    meeting: {
      areaId: form.areaId,
      areaName: form.areaName ?? null,
      neededPersonCount: 1,
      ownerId,
      plannedStartTime: startTime,
      plannedEndTime: new Date(startTime.getTime() + form.timeSpan * 60 * 1000),
      status: 'requested' as const,
      category: 'individual' as const,
      calculationSettings: initCalculationSettings(),
    },
    castId: cast.id,
  };
}

// --- OrderRequestForm (cast proposes to a guest) ---------------------------

export const orderRequestFormSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  timeSpan: z.coerce.number().int(),
  startTime: z.string(),
  areaId: z.coerce.number().int(),
  areaName: z.string().optional().nullable(),
  baseCostPerTime: z.coerce.number().int(),
});

export type OrderRequestFormInput = z.infer<typeof orderRequestFormSchema>;

/** OrderRequestForm#to_meeting, including #fee_within_limits. */
export async function buildOrderRequestMeeting(
  form: OrderRequestFormInput,
  castId: number,
): Promise<{ meeting: Record<string, unknown>; ownerId: number }> {
  if (form.timeSpan < 60) throw new ValidationError('時間を選択してください。');

  const { partnerId } = await resolveConversationParties(form.conversationId, castId);
  const cast = await prisma.user.findUniqueOrThrow({
    where: { id: castId },
    include: { castLevel: { select: { minOrderFeePerTime: true, maxOrderFeePerTime: true } } },
  });
  if (cast.userType !== 'cast') throw new ValidationError('cast must be user type cast');

  // the proposed fee must respect the cast level's limits
  const lower = cast.castLevel?.minOrderFeePerTime ?? null;
  const upper = cast.castLevel?.maxOrderFeePerTime ?? null;
  if (lower !== null || upper !== null) {
    if ((lower !== null && lower > form.baseCostPerTime) || (upper !== null && upper < form.baseCostPerTime)) {
      const lowerText = lower !== null ? `下限${lower}P` : '';
      const upperText = upper !== null ? `上限${upper}P` : '';
      throw new ValidationError(`ポイントの設定は、${lowerText}〜${upperText}です。`);
    }
  }

  const startTime = beginningOfMinute(new Date(form.startTime));
  validateStartTime(startTime);

  return {
    meeting: {
      areaId: form.areaId,
      areaName: form.areaName ?? null,
      neededPersonCount: 1,
      ownerId: partnerId,
      plannedStartTime: startTime,
      plannedEndTime: new Date(startTime.getTime() + form.timeSpan * 60 * 1000),
      baseCostPerTime: form.baseCostPerTime,
      prolongCostPerTime: idiv(
        form.baseCostPerTime * config.individual_meeting_prolong_multiplier_permille,
        1000,
      ),
      status: 'cast_requested' as const,
      category: 'individual' as const,
      calculationSettings: initCalculationSettings(),
    },
    ownerId: partnerId,
  };
}
