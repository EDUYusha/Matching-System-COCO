import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { hashPassword } from '@/server/lib/auth';
import { AppError, NotFoundError } from '@/server/lib/errors';
import { paginate, paginationArgs } from '@/server/lib/pagination';
import { requireAdmin } from '@/server/api/admin-scope';

/**
 * The settings tables behind the admin panel.
 *
 * Every one of them is the same list/create/update/delete screen over one table,
 * so the original generated the routes from this descriptor list rather than
 * writing them out twenty times. Next needs a file per path, so the files are
 * thin wrappers (see src/app/api/admin/<resource>/route.ts) and all of the
 * behaviour — ordering, the write schema, the habtm rows to include, the
 * readonly-column rules — stays here.
 */

export type AdminCrudResource = {
  path: string;
  model: string;
  orderBy: Record<string, 'asc' | 'desc'>;
  schema: z.ZodObject<z.ZodRawShape>;
  /** habtm join rows to ship with each row, so the link editor knows what is already set */
  include?: Record<string, boolean>;
};

/**
 * The settings screens are all the same list/create/update/delete shape over one
 * table, so they are generated rather than written out 15 times. Each entry names
 * the Prisma delegate, the zod schema for writes and the default ordering.
 */
export const crudResources: AdminCrudResource[] = [
  {
    path: 'business_areas',
    model: 'businessArea' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      active: z.boolean().optional(),
      sortIndex: z.coerce.number().optional(),
      color: z.string().optional(),
    }),
  },
  {
    path: 'areas',
    model: 'area' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      businessAreaId: z.coerce.number(),
      name: z.string().min(1),
      sortIndex: z.coerce.number().optional(),
      custom: z.boolean().optional(),
    }),
  },
  {
    path: 'cast_levels',
    model: 'castLevel' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      sortIndex: z.coerce.number().optional(),
      color: z.string().optional(),
      minOrderFeePerTime: z.coerce.number().nullable().optional(),
      maxOrderFeePerTime: z.coerce.number().nullable().optional(),
    }),
  },
  {
    path: 'cast_ranks',
    model: 'castRank' as const,
    include: { castLevels: true },
    orderBy: { baseCostPerTime: 'asc' as const },
    schema: z.object({
      businessAreaId: z.coerce.number(),
      name: z.string().min(1),
      baseCostPerTime: z.coerce.number(),
      prolongCostPerTime: z.coerce.number(),
      proposedPrice: z.boolean().optional(),
      fixedPrice: z.boolean().optional(),
    }),
  },
  {
    path: 'customer_levels',
    model: 'customerLevel' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      color: z.string().optional(),
      sortIndex: z.coerce.number().optional(),
      entrySpending: z.coerce.number().nullable().optional(),
      holdSpending: z.coerce.number().nullable().optional(),
      nextLevelId: z.coerce.number().nullable().optional(),
      prevLevelId: z.coerce.number().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  },
  {
    path: 'sticker_templates',
    model: 'stickerTemplate' as const,
    orderBy: { price: 'asc' as const },
    schema: z.object({
      pictureUrl: z.string().min(1),
      name: z.string().min(1),
      businessAreaId: z.coerce.number(),
      price: z.coerce.number(),
      transactionPricePermille: z.coerce.number().nullable().optional(),
      transactionPriceAbs: z.coerce.number().nullable().optional(),
      active: z.boolean().optional(),
    }),
  },
  {
    path: 'event_campaigns',
    model: 'eventCampaign' as const,
    orderBy: { startAt: 'desc' as const },
    // EventCampaign#end_at_after_start_at is checked in prepareWriteData, which
    // sees the merged row on update and so can validate a partial edit too.
    schema: z.object({
      name: z.string().min(1),
      stickerTemplateId: z.coerce.number(),
      castRewardAmount: z.coerce.number().min(0).optional(),
      castDailyLimit: z.coerce.number().positive().optional(),
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      limitedStickerTemplateIds: z.string().nullable().optional(),
      milestoneGiftThreshold: z.coerce.number().min(0).optional(),
    }),
  },
  {
    path: 'trophies',
    model: 'trophy' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      imageUrl: z.string().min(1),
      description: z.string().nullable().optional(),
      active: z.boolean().optional(),
    }),
  },
  {
    path: 'banners',
    model: 'banner' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      name: z.string().nullable().optional(),
      bannerPictureUrl: z.string().min(1),
      mainPictureUrl: z.string().nullable().optional(),
      position: z.string().nullable().optional(),
    }),
  },
  {
    path: 'service_messages',
    model: 'serviceMessage' as const,
    orderBy: { createdAt: 'desc' as const },
    schema: z.object({
      title: z.string().nullable().optional(),
      content: z.string().nullable().optional(),
      businessAreaId: z.coerce.number().nullable().optional(),
      forCustomers: z.boolean().optional(),
      forCast: z.boolean().optional(),
      forInviters: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
  },
  {
    path: 'rewarding_rules',
    model: 'rewardingRule' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      category: z.enum(['invitation', 'being_reviewed', 'reviewing', 'usage', 'attendance']),
      userType: z.string().nullable().optional(),
      userId: z.coerce.number().nullable().optional(),
      overrideId: z.coerce.number().nullable().optional(),
      policy: z.enum(['fixed_steps', 'fixed_turnover', 'relative_turnover']),
      payout: z.coerce.number().optional(),
      payoutPermille: z.coerce.number().optional(),
      each: z.coerce.number().optional(),
      limit: z.coerce.number().nullable().optional(),
      inviteeUserType: z.string().nullable().optional(),
      serviceFeeReset: z.coerce.number().optional(),
      serviceFeeIncrease: z.coerce.number().optional(),
      minStars: z.coerce.number().optional(),
    }),
  },
  {
    path: 'highlightings',
    model: 'highlighting' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      categoryName: z.string().min(1),
      userType: z.string().optional(),
      note: z.string().nullable().optional(),
      active: z.boolean().optional(),
      sortIndex: z.coerce.number().nullable().optional(),
    }),
  },
  {
    path: 'meeting_places',
    model: 'meetingPlace' as const,
    include: { tags: true },
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      areaId: z.coerce.number(),
      name: z.string().min(1),
      url: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      imageUrls: z.array(z.string()).optional(),
      active: z.boolean().optional(),
      sortIndex: z.coerce.number().optional(),
    }),
  },
  {
    path: 'meeting_place_tags',
    model: 'meetingPlaceTag' as const,
    orderBy: { name: 'asc' as const },
    schema: z.object({ name: z.string().min(1), active: z.boolean().optional() }),
  },
  {
    path: 'roulettes',
    model: 'roulette' as const,
    include: { customerLevels: true },
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      fee: z.coerce.number(),
      sortIndex: z.coerce.number(),
      active: z.boolean().optional(),
    }),
  },
  {
    path: 'roulette_entries',
    model: 'rouletteEntry' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      rouletteId: z.coerce.number(),
      stickerTemplateId: z.coerce.number(),
      chancePermille: z.coerce.number(),
      displayChance: z.string().nullable().optional(),
      highValue: z.boolean().optional(),
    }),
  },
  {
    path: 'attributes_schema',
    model: 'attributesSchema' as const,
    orderBy: { sortIndex: 'asc' as const },
    schema: z.object({
      name: z.string().min(1),
      validity: z.enum(['cast', 'customer', 'all']).nullable().optional(),
      attributeType: z.string().nullable().optional(),
      comment: z.string().nullable().optional(),
      category: z.string().min(1),
      valueList: z.array(z.string()).nullable().optional(),
      sortIndex: z.coerce.number().nullable().optional(),
    }),
  },
  {
    path: 'meeting_preferences_schema',
    model: 'meetingPreferencesSchema' as const,
    orderBy: { sortIndex: 'asc' as const },
    // MeetingPreferencesSchema has attr_readonly on name/category/subcategory,
    // so only the tunable fields are writable on update (enforced below).
    schema: z.object({
      name: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      subcategory: z.string().nullable().optional(),
      sortIndex: z.coerce.number().nullable().optional(),
      active: z.boolean().optional(),
      score: z.coerce.number().optional(),
      castPreference: z.boolean().optional(),
      customerPreference: z.boolean().optional(),
      mutuallyExclusive: z.boolean().optional(),
    }),
  },
  {
    path: 'company_informations',
    model: 'companyInformation' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      name: z.string().nullable().optional(),
      zipCode: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      building: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      personInCharge: z.string().nullable().optional(),
    }),
  },
  {
    path: 'admins',
    model: 'admin' as const,
    orderBy: { id: 'asc' as const },
    schema: z.object({
      loginName: z.string().min(1),
      businessAreaId: z.coerce.number().nullable().optional(),
      password: z.string().min(6).optional(),
    }),
  },
];

export async function afterWrite(path: string, item: { id: number; position?: string | null }): Promise<void> {
if (path === 'banners' && item.position) {
  await prisma.banner.updateMany({
    where: { position: item.position, id: { not: item.id } },
    data: { position: null },
  });
}
}

/** Per-resource write fix-ups: password hashing and JSON columns. */
export async function prepareWriteData(
path: string,
data: Record<string, unknown>,
id: number | null,
): Promise<Record<string, unknown>> {
const prepared = { ...data };

if (path === 'event_campaigns') {
  // validate against the merged row, so editing only one end still checks both
  const existing = id ? await prisma.eventCampaign.findUnique({ where: { id } }) : null;
  const startAt = (prepared.startAt as Date | undefined) ?? existing?.startAt;
  const endAt = (prepared.endAt as Date | undefined) ?? existing?.endAt;
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw new AppError('終了日時は開始日時より後でなければなりません', { statusCode: 422 });
  }
}

if (path === 'admins' && typeof prepared.password === 'string') {
  prepared.passwordDigest = await hashPassword(prepared.password);
  delete prepared.password;
}
if (path === 'attributes_schema' && Array.isArray(prepared.valueList)) {
  prepared.valueList = prepared.valueList as Prisma.InputJsonValue;
}
if (path === 'meeting_places' && Array.isArray(prepared.imageUrls)) {
  prepared.imageUrls = prepared.imageUrls as Prisma.InputJsonValue;
}

return prepared;
}

// --- the handlers every settings screen shares ------------------------------

/**
 * The four actions the original generated per resource. They are exported as
 * functions so each `app/api/admin/<resource>/route.ts` is a two-line wrapper
 * naming its resource, which is the only thing that differs between them.
 */

export function resourceFor(path: string): AdminCrudResource {
  const resource = crudResources.find((candidate) => candidate.path === path);
  if (!resource) throw new NotFoundError(`unknown settings resource: ${path}`);
  return resource;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const delegate = (resource: AdminCrudResource): any =>
  (prisma as unknown as Record<string, unknown>)[resource.model];

export async function listResource(
  path: string,
  searchParams: URLSearchParams,
): Promise<Paginated<unknown>> {
  await requireAdmin();
  const resource = resourceFor(path);
  const query = z
    .object({ page: z.coerce.number().optional(), perPage: z.coerce.number().optional() })
    .parse(Object.fromEntries(searchParams.entries()));
  const page = query.page ?? 1;
  const perPage = Math.min(query.perPage ?? 100, 500);

  const [items, totalCount] = await Promise.all([
    delegate(resource).findMany({
      orderBy: resource.orderBy,
      ...(resource.include ? { include: resource.include } : {}),
      ...paginationArgs(page, perPage),
    }),
    delegate(resource).count(),
  ]);

  return paginate(items, totalCount, page, perPage);
}

export async function showResource(path: string, id: number): Promise<{ item: unknown }> {
  await requireAdmin();
  const resource = resourceFor(path);
  return {
    item: await delegate(resource).findUniqueOrThrow({
      where: { id },
      ...(resource.include ? { include: resource.include } : {}),
    }),
  };
}

export async function createResource(path: string, input: unknown) {
  await requireAdmin();
  const resource = resourceFor(path);
  const data = resource.schema.parse(input) as Record<string, unknown>;
  const prepared = await prepareWriteData(resource.path, data, null);
  const item = await delegate(resource).create({ data: prepared });
  await afterWrite(resource.path, item);
  return { ok: true, item };
}

export async function updateResource(path: string, id: number, input: unknown) {
  await requireAdmin();
  const resource = resourceFor(path);
  const data = resource.schema.partial().parse(input) as Record<string, unknown>;

  // attr_readonly :name, :category, :subcategory
  if (resource.path === 'meeting_preferences_schema') {
    delete data.name;
    delete data.category;
    delete data.subcategory;
  }

  const prepared = await prepareWriteData(resource.path, data, id);
  const item = await delegate(resource).update({ where: { id }, data: prepared });
  await afterWrite(resource.path, item);
  return { ok: true, item };
}

export async function destroyResource(path: string, id: number) {
  await requireAdmin();
  const resource = resourceFor(path);

  // AttributesSchema#readonly? — existing rows may never be edited or removed
  if (resource.path === 'attributes_schema') {
    throw new AppError('プロフィール入力項目は削除できません（既存データに影響します）');
  }

  await delegate(resource).delete({ where: { id } });
  return { ok: true };
}
