import { ACCESS_LEVEL_RANKING, ageFromBirthday, config, isoDate, tokyoParts } from '@/lib';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/lib/prisma';
import { ValidationError } from '@/server/lib/errors';
import { hashPassword } from '@/server/lib/auth';
import { decodeInvitationCode, encodeInvitationCode } from '@/server/lib/invitation-code';
import { sanitizeProfileHtml } from '@/server/lib/sanitize';
import { parseShrineData, promoteUpload, storeRemoteUpload, uploadUrl, type ShrineData } from '@/server/lib/uploads';
import { createAdminConversation, createSystemConversation, fixConversationNames } from '@/server/services/conversations';
import { createCreditTransaction } from '@/server/services/credits';
import { registrationMessage } from '@/server/services/auto-send-message';

/**
 * Ports the User model's validations and callbacks plus the CreateUser interactor.
 *
 * Rails spread this over validations, before/after hooks and a handful of
 * attr_accessor flags (usual_init, with_settings, with_attributes, …). Here the
 * validation is one function returning Rails-style messages, and the hooks are
 * explicit steps in createUser.
 */

export const EMAIL_REGEX = /^([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})$/i;
export const CAST_PHONE_REGEX = /^\d{6,}$/;

export interface UserValidationInput {
  id?: number;
  email?: string | null;
  password?: string | null;
  passwordConfirmation?: string | null;
  snsId?: string | null;
  nickName?: string | null;
  userType: string;
  accessLevel?: string;
  serviceFeePermille?: number | null;
  frozenCredits?: number;
  phone?: string | null;
  birthday?: Date | null;
  orderFeePerTime?: number | null;
  /** User#with_fee_limit_check — only checked where the original opted in */
  withFeeLimitCheck?: boolean;
  castLevel?: { minOrderFeePerTime: number | null; maxOrderFeePerTime: number | null } | null;
  /** true when the age setter was used, which changes which field the error lands on */
  usedAgeSetter?: boolean;
}

export type ValidationErrors = Record<string, string[]>;

function addError(errors: ValidationErrors, field: string, message: string): void {
  errors[field] = errors[field] ?? [];
  errors[field].push(message);
}

/** All of the User model's validations, in one place. */
export async function validateUser(
  input: UserValidationInput,
  options: { onCreate?: boolean; tx?: Tx } = {},
): Promise<ValidationErrors> {
  const errors: ValidationErrors = {};
  const client = options.tx ?? prisma;

  // before_validation { (self.email = nil; self.password = nil) if self.email.blank? }
  const email = input.email?.trim() ? input.email.trim() : null;

  if (email !== null) {
    if (!EMAIL_REGEX.test(email)) addError(errors, 'email', 'は不正な値です');
    const duplicate = await client.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        ...(input.id ? { id: { not: input.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) addError(errors, 'email', 'はすでに存在します');
  }

  // password: min 6, confirmation must match; required on create only with an email
  const wantsPassword = input.password !== undefined && input.password !== null && input.password !== '';
  if (options.onCreate && email !== null && !wantsPassword) {
    addError(errors, 'password', 'は必須項目です');
  }
  if (wantsPassword) {
    if ((input.password as string).length < 6) {
      addError(errors, 'password', 'は6文字以上で入力してください');
    }
    if (
      input.passwordConfirmation !== undefined &&
      input.passwordConfirmation !== null &&
      input.password !== input.passwordConfirmation
    ) {
      addError(errors, 'password_confirmation', 'が一致しません');
    }
  }

  if (input.snsId) {
    const duplicate = await client.user.findFirst({
      where: { snsId: input.snsId, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { id: true },
    });
    if (duplicate) addError(errors, 'sns_id', 'はすでに存在します');
  }

  if (!input.nickName?.trim()) addError(errors, 'nick_name', 'を入力してください');

  if (input.userType === 'cast' && input.accessLevel === 'full') {
    const permille = input.serviceFeePermille;
    if (permille === null || permille === undefined) {
      addError(errors, 'service_fee_permille', 'を入力してください');
    } else if (permille < 0 || permille > 1000) {
      addError(errors, 'service_fee_permille', 'は0から1000の間で入力してください');
    }
  }

  if ((input.frozenCredits ?? 0) < 0) {
    addError(errors, 'frozen_credits', 'は0以上の値にしてください');
  }

  if (input.userType === 'cast') {
    if (!input.phone) {
      addError(errors, 'phone', 'を入力してください');
    } else if (!CAST_PHONE_REGEX.test(input.phone)) {
      addError(errors, 'phone', 'は不正な値です');
    }
  }
  if (input.userType === 'customer' && input.phone) {
    const duplicate = await client.user.findFirst({
      where: { phone: input.phone, ...(input.id ? { id: { not: input.id } } : {}) },
      select: { id: true },
    });
    if (duplicate) addError(errors, 'phone', 'はすでに存在します');
  }

  // older_than_18
  if (input.birthday) {
    const age = ageFromBirthday(input.birthday);
    if (age !== null && age < 18) {
      addError(errors, input.usedAgeSetter ? 'age' : 'birthday', '未成年禁止');
    }
  }

  // has_auth_method
  if (email === null && !input.snsId) {
    addError(errors, 'email', 'SNSログインしない場合はメールが必要です。');
  }

  // fee_limits
  if (input.withFeeLimitCheck && input.orderFeePerTime !== null && input.orderFeePerTime !== undefined) {
    const lower = input.castLevel?.minOrderFeePerTime ?? null;
    const upper = input.castLevel?.maxOrderFeePerTime ?? null;
    if (lower !== null || upper !== null) {
      if ((lower !== null && lower > input.orderFeePerTime) || (upper !== null && upper < input.orderFeePerTime)) {
        const lowerText = lower !== null ? `下限${lower}P` : '';
        const upperText = upper !== null ? `上限${upper}P` : '';
        addError(errors, 'order_fee_per_time', `ポイントの設定は、${lowerText}〜${upperText}です。`);
      }
    }
  }

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function fullMessages(errors: ValidationErrors): string[] {
  return Object.entries(errors).flatMap(([field, messages]) => messages.map((message) => `${field} ${message}`));
}

export function assertValid(errors: ValidationErrors): void {
  if (hasErrors(errors)) {
    throw new ValidationError(fullMessages(errors).join('\n'), errors);
  }
}

// --- attributes ------------------------------------------------------------

/**
 * The `validity` values that apply to a user_type.
 *
 * attributes_schema.validity only ever holds 'cast', 'customer' or 'all'. The
 * Ruby queried `validity IN (user_type, 'all')`, so an inviter, operator, admin or
 * system account simply matched nothing beyond 'all' — that behaviour is kept,
 * but made explicit because Postgres rejects a non-enum value outright where
 * MySQL's varchar column accepted it.
 */
export function validitiesFor(userType: string): Array<'cast' | 'customer' | 'all'> {
  if (userType === 'cast') return ['cast', 'all'];
  if (userType === 'customer') return ['customer', 'all'];
  return ['all'];
}

/**
 * User#add_attributes — every new user gets a blank row for each schema entry
 * that applies to their user_type, so the profile editor has a stable form.
 */
export async function addAttributesFor(userId: number, userType: string, tx?: Tx): Promise<void> {
  const client = tx ?? prisma;
  const schema = await client.attributesSchema.findMany({
    where: { validity: { in: validitiesFor(userType) } },
  });
  if (!schema.length) return;
  await client.attribute.createMany({
    data: schema.map((entry) => ({
      userId,
      name: entry.name,
      category: entry.category,
      valueType: entry.attributeType,
    })),
    skipDuplicates: true,
  });
}

export interface AttributeEntryRow {
  id: number;
  name: string;
  value: string | null;
  valueType: string | null;
  category: string;
  comment: string | null;
  valueList: string[] | null;
  sortIndex: number | null;
}

/**
 * User#attribute_entries — the user's attributes joined to the schema, ordered by
 * the schema's sort_index and filtered by what applies to their user_type.
 */
export async function attributeEntries(
  userId: number,
  userType: string,
  options: { category?: string; missing?: boolean } = {},
): Promise<AttributeEntryRow[]> {
  const includeMissing = options.missing ?? true;
  const validities = validitiesFor(userType);
  const validityList = Prisma.join(
    validities.map((validity) => Prisma.sql`${validity}::"AttributeValidity"`),
  );
  const categoryClause = options.category
    ? Prisma.sql`AND attributes.category = ${options.category}`
    : Prisma.empty;
  const missingClause = includeMissing ? Prisma.empty : Prisma.sql`AND attributes.value IS NOT NULL`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      name: string;
      value: string | null;
      value_type: string | null;
      category: string;
      comment: string | null;
      value_list: unknown;
      sort_index: number | null;
    }>
  >(Prisma.sql`
    SELECT attributes.id, attributes.name, attributes.value, attributes.value_type, attributes.category,
           attributes_schema.comment, attributes_schema.value_list, attributes_schema.sort_index
    FROM attributes
    INNER JOIN attributes_schema ON attributes.name = attributes_schema.name
    WHERE attributes.user_id = ${userId}
      AND attributes_schema.validity IN (${validityList})
      ${categoryClause}
      ${missingClause}
    ORDER BY attributes_schema.sort_index
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    value: row.value,
    valueType: row.value_type,
    category: row.category,
    comment: row.comment,
    valueList: normaliseValueList(row.value_list),
    sortIndex: row.sort_index,
  }));
}

export function normaliseValueList(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * User#update_attribute_entries.
 *
 * Keeps the original's odd-looking skip rules, which exist because the form
 * always submits every field: a Date of 1960-01-01 and an Integer of 0 are the
 * "not filled in" sentinels the date and number selects produce.
 */
export async function updateAttributeEntries(
  userId: number,
  newEntries: Record<string, unknown>,
  options: { category?: string } = {},
): Promise<boolean> {
  try {
    const entries = await prisma.attribute.findMany({
      where: { userId, ...(options.category ? { category: options.category } : {}) },
    });

    await prisma.$transaction(async (t) => {
      for (const [name, rawValue] of Object.entries(newEntries)) {
        const entry = entries.find((candidate) => candidate.name === name);
        if (!entry) continue;

        let newValue: string;
        if (entry.valueType === 'Date') {
          const parts = rawValue as { year?: unknown; month?: unknown; day?: unknown };
          newValue = `${Number(parts?.year)}-${String(Number(parts?.month)).padStart(2, '0')}-${String(
            Number(parts?.day),
          ).padStart(2, '0')}`;
          if (newValue === '1960-01-01') continue;
        } else if (entry.valueType === 'Integer') {
          if (Number(rawValue) === 0 || Number.isNaN(Number(rawValue))) continue;
          newValue = String(rawValue);
        } else {
          newValue = rawValue === null || rawValue === undefined ? '' : String(rawValue);
          if (entry.value === newValue) continue;
        }

        // Attribute#sanitize_text runs for rich-text values
        const value = entry.valueType === 'Text' ? sanitizeProfileHtml(newValue) : newValue;
        await t.attribute.update({ where: { id: entry.id }, data: { value } });
      }
    });
    return true;
  } catch {
    return false;
  }
}

// --- user creation ---------------------------------------------------------

export interface CreateUserInput {
  nickName: string;
  email?: string | null;
  password?: string | null;
  passwordConfirmation?: string | null;
  userType: 'cast' | 'customer' | 'inviter' | 'operator' | 'admin' | 'system';
  snsId?: string | null;
  phone?: string | null;
  birthday?: Date | null;
  birthdayPublished?: number | null;
  age?: number | null;
  inviterCode?: string | null;
  businessAreaId?: number | null;
  castLevelId?: number | null;
  accessLevel?: string;
  publicProfile?: boolean;
  serviceFeePermille?: number | null;
  adSource?: string | null;
  profilePicUrl?: string | null;
  /** CreateUser's `simulate` flag, which swaps the remote picture for a fixture */
  simulate?: boolean;
}

/** User#age= — stores a birthday that yields the given age today. */
export function birthdayForAge(age: number | null | undefined): Date | null {
  if (age === null || age === undefined || Number.isNaN(Number(age))) return null;
  const today = tokyoParts(new Date());
  return new Date(
    `${today.year - Number(age)}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}T00:00:00+09:00`,
  );
}

/** CreateUser */
export async function createUser(input: CreateUserInput): Promise<{ user: User; errors?: ValidationErrors }> {
  const birthday = input.birthday ?? birthdayForAge(input.age);

  let inviterId: number | null = null;
  const errors = await validateUser(
    {
      email: input.email,
      password: input.password,
      passwordConfirmation: input.passwordConfirmation,
      snsId: input.snsId,
      nickName: input.nickName,
      userType: input.userType,
      accessLevel: input.accessLevel ?? 'full',
      serviceFeePermille: input.serviceFeePermille,
      phone: input.phone,
      birthday,
      usedAgeSetter: input.age !== undefined && input.age !== null,
    },
    { onCreate: true },
  );

  if (input.inviterCode?.trim()) {
    const decoded = decodeInvitationCode(input.inviterCode.trim());
    const inviter = decoded ? await prisma.user.findFirst({ where: { id: decoded, discardedAt: null } }) : null;
    if (!inviter) {
      addError(errors, 'inviter_code', 'は見つかりませんでした');
    } else {
      inviterId = inviter.id;
    }
  }

  assertValid(errors);

  const email = input.email?.trim() ? input.email.trim() : null;
  const passwordDigest = email && input.password ? await hashPassword(input.password) : null;

  const user = await prisma.$transaction(async (t) => {
    const created = await t.user.create({
      data: {
        nickName: input.nickName,
        email,
        passwordDigest,
        userType: input.userType,
        snsId: input.snsId ?? null,
        phone: input.phone ?? null,
        birthday,
        birthdayPublished: input.birthdayPublished ?? null,
        // before_create -> self.join_date ||= Date.today
        joinDate: new Date(`${isoDate(new Date())}T00:00:00+09:00`),
        loggedOut: false,
        inviterId,
        businessAreaId: input.businessAreaId ?? null,
        castLevelId: input.castLevelId ?? null,
        accessLevel: (input.accessLevel ?? 'full') as never,
        publicProfile: input.publicProfile ?? true,
        serviceFeePermille: input.serviceFeePermille ?? null,
        adSource: input.adSource ?? null,
        // default cast payback to 1% (before_create in the model)
        firstExperienceRewardPermille: input.userType === 'cast' ? 10 : 0,
        lastPostReadAt: new Date(),
        lastServiceMessageReadAt: new Date(),
      },
    });

    // after_create :add_associations, with usual_init set by CreateUser
    await t.userSettings.create({ data: { userId: created.id } });
    await addAttributesFor(created.id, created.userType, t);
    await createSystemConversation(created.id, t);
    if (created.userType !== 'admin') await createAdminConversation(created.id, t);

    return created;
  });

  // the LINE profile picture becomes the initial profile photo
  if (input.profilePicUrl) {
    const data = input.simulate ? null : await storeRemoteUpload(input.profilePicUrl);
    if (data) {
      const stored = await promoteUpload(data);
      await prisma.picture.create({
        data: { userId: user.id, public: true, profilePic: true, fileData: stored as unknown as Prisma.InputJsonValue },
      });
      await prisma.user.update({ where: { id: user.id }, data: { profilePicUrl: uploadUrl(stored) } });
    }
  }

  // starting credits for guests
  if (user.userType === 'customer') {
    if (inviterId === null && config.customer_start_credits_not_invited > 0) {
      await createCreditTransaction({
        creditedUserId: user.id,
        creditedAmount: config.customer_start_credits_not_invited,
        category: 'manual',
        reason: '初回登録ポイント付与（自動）',
        withBalanceUpdates: true,
      });
    } else if (inviterId !== null && config.customer_start_credits_invited > 0) {
      await createCreditTransaction({
        creditedUserId: user.id,
        creditedAmount: config.customer_start_credits_invited,
        category: 'manual',
        reason: '初回登録ポイント付与（紹介者あり）',
        withBalanceUpdates: true,
      });
    }
  }

  await registrationMessage({
    id: user.id,
    nickName: user.nickName,
    userType: user.userType,
    inviterId: user.inviterId,
  });

  return { user };
}

// --- profile updates -------------------------------------------------------

export interface UpdateBasicsInput {
  nickName?: string;
  motto?: string | null;
  age?: number | null;
  birthday?: Date | null;
  birthdayPublished?: number | null;
  /** cast only */
  orderFeePerTime?: number | null;
}

/** ProfilesController#update_basics, including the fee-limit check and rename fix-up. */
export async function updateBasics(userId: number, input: UpdateBasicsInput): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { castLevel: { select: { minOrderFeePerTime: true, maxOrderFeePerTime: true } } },
  });

  const isCast = user.userType === 'cast' || user.userType === 'operator' || user.userType === 'admin';
  const birthday =
    input.birthday !== undefined ? input.birthday : input.age !== undefined ? birthdayForAge(input.age) : user.birthday;

  // before_validation -> order_fee_per_time = nil if it is 0
  let orderFeePerTime = isCast ? (input.orderFeePerTime ?? user.orderFeePerTime) : user.orderFeePerTime;
  if (orderFeePerTime === 0) orderFeePerTime = null;

  const errors = await validateUser(
    {
      id: user.id,
      email: user.email,
      snsId: user.snsId,
      nickName: input.nickName ?? user.nickName,
      userType: user.userType,
      accessLevel: user.accessLevel,
      serviceFeePermille: user.serviceFeePermille,
      frozenCredits: user.frozenCredits,
      phone: user.phone,
      birthday,
      orderFeePerTime,
      withFeeLimitCheck: true,
      castLevel: user.castLevel,
      usedAgeSetter: input.age !== undefined && input.age !== null,
    },
    {},
  );
  assertValid(errors);

  const nickNameChanged = input.nickName !== undefined && input.nickName !== user.nickName;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(input.nickName !== undefined ? { nickName: input.nickName } : {}),
      ...(input.motto !== undefined ? { motto: input.motto } : {}),
      ...(birthday !== undefined ? { birthday } : {}),
      ...(input.birthdayPublished !== undefined ? { birthdayPublished: input.birthdayPublished } : {}),
      ...(isCast ? { orderFeePerTime } : {}),
    },
  });

  // after_update :fix_conversation_names, if update_private_conversations
  if (nickNameChanged && input.nickName) {
    await fixConversationNames(user.id, input.nickName);
  }
}

/** User#mark_activity! */
export async function markActivity(userId: number): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastActivity: new Date() } }).catch(() => undefined);
}

/** User#online? */
export function isOnline(user: Pick<User, 'loggedOut' | 'lastActivity'>): boolean {
  if (user.loggedOut) return false;
  if (!user.lastActivity) return false;
  return user.lastActivity.getTime() > Date.now() - 30 * 60 * 1000;
}

/** User#available? */
export function isAvailable(user: Pick<User, 'availableUntil'>): boolean {
  return !!user.availableUntil && user.availableUntil.getTime() > Date.now();
}

/** User#bookable? */
export function isBookable(user: Pick<User, 'userType' | 'accessLevel' | 'orderFeePerTime'>): boolean {
  return (
    user.userType === 'cast' &&
    ACCESS_LEVEL_RANKING.indexOf(user.accessLevel as never) >= ACCESS_LEVEL_RANKING.indexOf('full') &&
    user.orderFeePerTime !== null
  );
}

/** User#credit_card? — a leading "!" marks a registration still in flight. */
export function hasValidCreditCard(user: Pick<User, 'creditcardToken'>): boolean {
  return !!user.creditcardToken && !user.creditcardToken.startsWith('!');
}

/** User#nick_name / #profile_pic_url / #birthday for soft-deleted accounts. */
export function displayNickName(user: Pick<User, 'nickName' | 'discardedAt'>): string {
  return user.discardedAt ? '[削除]' : user.nickName;
}

export function displayProfilePicUrl(user: Pick<User, 'profilePicUrl' | 'discardedAt'>): string {
  if (user.discardedAt) return '/system/profile-pic-discarded.png';
  return user.profilePicUrl?.trim() ? user.profilePicUrl : '/system/noimage.png';
}

export function displayBirthday(user: Pick<User, 'birthday' | 'discardedAt'>): Date | null {
  return user.discardedAt ? null : user.birthday;
}

/** User#invitation_code */
export function invitationCode(userId: number): string {
  return encodeInvitationCode(userId);
}

/** User#level — cast see their cast level, guests their customer level. */
export function levelOf(user: {
  userType: string;
  castLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
  customerLevel?: { id: number; name: string; color: string; sortIndex: number } | null;
}) {
  if (user.userType === 'customer' || user.userType === 'inviter') return user.customerLevel ?? null;
  if (user.userType === 'cast') return user.castLevel ?? null;
  return null;
}

/** User#restore — re-opens a soft-deleted account with fresh credentials. */
export async function restoreUser(userId: number, options: { public?: boolean } = {}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const { alphanumeric } = await import('@/server/lib/auth');
  const password = alphanumeric(10);
  const email = `restore_user_${user.id}@co-co.today`;

  const businessAreaId =
    user.businessAreaId === null && user.userType === 'cast'
      ? (await prisma.businessArea.findFirst({ where: { active: true }, orderBy: { id: 'asc' } }))?.id ?? null
      : user.businessAreaId;
  const castLevelId =
    user.castLevelId === null && user.userType === 'cast'
      ? (await prisma.castLevel.findFirst({ orderBy: { id: 'asc' } }))?.id ?? null
      : user.castLevelId;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      discardedAt: null,
      snsId: null,
      email,
      passwordDigest: await hashPassword(password),
      businessAreaId,
      castLevelId,
      accessLevel: 'full',
      publicProfile: options.public ?? false,
    },
  });

  return { email, password };
}

/** Picture#after_save — only one profile picture, mirrored onto the user row. */
export async function setProfilePicture(pictureId: number, tx?: Tx): Promise<void> {
  await transaction(tx, async (t) => {
    const picture = await t.picture.findUniqueOrThrow({ where: { id: pictureId } });
    await t.picture.updateMany({
      where: { userId: picture.userId, profilePic: true, id: { not: picture.id } },
      data: { profilePic: false },
    });
    await t.picture.update({ where: { id: picture.id }, data: { profilePic: true } });
    const data = parseShrineData(picture.fileData);
    // update_columns in the original: skips User validations, which would fail
    // for SNS-only accounts that have no email
    await t.user.update({ where: { id: picture.userId }, data: { profilePicUrl: uploadUrl(data) } });
  });
}

export function pictureUrl(picture: { fileData: unknown }): string | null {
  return uploadUrl(parseShrineData(picture.fileData));
}

export type { ShrineData };
