import { Prisma } from '@prisma/client';
import { config, tokyoParts, tokyoPrevMonth, tokyoStartOfDay, tokyoStartOfMonth, tokyoStartOfYear } from '@/lib';
import type { RankingCategory, RankingPeriod } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { logger } from '@/server/lib/logger';

/**
 * Port of ProfilesController's five ranking actions.
 *
 * The shape of every ranking is the same: build a set of (user, amount) rows,
 * sum them per user, order by score and number the result. Two things make it
 * more than a GROUP BY:
 *
 *   * the "cheat" columns. Operators can hand a user a head start via
 *     users.meeting_ranking_cheat / sticker_ranking_cheat. The original unions a
 *     synthetic one-row-per-user query carrying that bonus into the same sum,
 *     which is reproduced here verbatim.
 *   * opting out. user_settings.no_ranking hides a user, and for the monthly
 *     rankings it is their visibility *at the deadline* that counts, which is
 *     what user_ranking_visibility_history records. A user always sees their own
 *     position even while hidden from everyone else.
 */

const GUEST_TYPES = Prisma.sql`('customer'::"UserType", 'inviter'::"UserType")`;

export interface RankingRowRaw {
  position: bigint | number;
  score: bigint | number | null;
  user_id: number;
  user_type: string;
  user_nick_name: string;
  user_profile_pic: string | null;
  user_birthday: Date | string | null;
  user_birthday_published: number | null;
  user_level_id: number | null;
  user_guest_title: string | null;
}

/** ProfilesController#restrict_time_range, with the day boundary at 00:00 JST. */
export function periodRange(period: RankingPeriod): { from: Date | null; to: Date | null } {
  const dayChange = config.cast_like_day_change; // 0
  const now = new Date();
  let yesterdayEnd = tokyoStartOfDay(now, dayChange);
  if (tokyoParts(now).hour < dayChange) {
    yesterdayEnd = new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000);
  }

  switch (period) {
    case 'this_week':
      return { from: new Date(yesterdayEnd.getTime() - 7 * 24 * 60 * 60 * 1000), to: null };
    case 'this_month':
      return { from: tokyoStartOfMonth(yesterdayEnd, dayChange), to: null };
    case 'prev_month': {
      const from = tokyoStartOfMonth(tokyoPrevMonth(yesterdayEnd), dayChange);
      const to = tokyoStartOfMonth(yesterdayEnd, dayChange);
      return { from, to };
    }
    case 'this_year':
      return { from: tokyoStartOfYear(yesterdayEnd, dayChange), to: null };
    case 'event_period':
      return { from: null, to: null };
    default: // 'yesterday'
      return { from: new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000), to: null };
  }
}

function timeClause(column: string, range: { from: Date | null; to: Date | null }): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (range.from) parts.push(Prisma.sql`${Prisma.raw(column)} >= ${range.from}`);
  if (range.to) parts.push(Prisma.sql`${Prisma.raw(column)} < ${range.to}`);
  if (!parts.length) return Prisma.sql`TRUE`;
  return Prisma.join(parts, ' AND ');
}

/** ProfilesController#credits_ranking_deadline — the 10th at 23:59:59 JST. */
export function creditsRankingDeadline(period: RankingPeriod): Date | null {
  const now = new Date();
  if (period === 'this_month') {
    const t = tokyoParts(now);
    return new Date(`${t.year}-${String(t.month).padStart(2, '0')}-10T23:59:59+09:00`);
  }
  if (period === 'prev_month') {
    const t = tokyoParts(tokyoPrevMonth(now));
    return new Date(`${t.year}-${String(t.month).padStart(2, '0')}-10T23:59:59+09:00`);
  }
  return null;
}

/** ProfilesController#limited_event_ranking_deadline — the 3rd at 23:59:59 JST. */
export function limitedEventRankingDeadline(campaign: { endAt: Date } | null): Date | null {
  if (!campaign) return null;
  const t = tokyoParts(campaign.endAt);
  return new Date(`${t.year}-${String(t.month).padStart(2, '0')}-03T23:59:59+09:00`);
}

/**
 * ProfilesController#user_ids_hidden_at_deadline — the users whose most recent
 * visibility change before the deadline set them to hidden.
 */
export async function userIdsHiddenAtDeadline(deadline: Date | null): Promise<number[]> {
  if (!deadline) return [];
  try {
    const rows = await prisma.$queryRaw<Array<{ user_id: number }>>(Prisma.sql`
      SELECT user_id FROM (
        SELECT user_id, visible,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY changed_at DESC) AS rn
        FROM user_ranking_visibility_history
        WHERE changed_at <= ${deadline}
      ) AS h
      WHERE rn = 1 AND visible = false
    `);
    return rows.map((row) => row.user_id);
  } catch (error) {
    logger.warn({ error }, 'user_ids_hidden_at_deadline error');
    return [];
  }
}

const CREDIT_CATEGORIES: Record<string, Prisma.Sql> = {
  meeting: Prisma.sql`('meeting'::"CreditTransactionCategory")`,
  sticker: Prisma.sql`(
    'sticker'::"CreditTransactionCategory",
    'inviter'::"CreditTransactionCategory",
    'inviter_cast'::"CreditTransactionCategory",
    'inviter_profit_share'::"CreditTransactionCategory",
    'inviter_cast_profit_share'::"CreditTransactionCategory",
    'cast_reward'::"CreditTransactionCategory"
  )`,
  patron: Prisma.sql`('patron_reward'::"CreditTransactionCategory")`,
  credits: Prisma.sql`(
    'meeting'::"CreditTransactionCategory",
    'sticker'::"CreditTransactionCategory",
    'inviter'::"CreditTransactionCategory",
    'inviter_cast'::"CreditTransactionCategory",
    'inviter_profit_share'::"CreditTransactionCategory",
    'inviter_cast_profit_share'::"CreditTransactionCategory",
    'cast_reward'::"CreditTransactionCategory",
    'patron_reward'::"CreditTransactionCategory",
    'manual_reflect'::"CreditTransactionCategory"
  )`,
};

const USER_COLUMNS = Prisma.sql`
  users.id AS user_id,
  users.user_type AS user_type,
  users.nick_name AS user_nick_name,
  users.profile_pic_url AS user_profile_pic,
  users.birthday AS user_birthday,
  users.birthday_published AS user_birthday_published,
  users.join_date AS user_join_date,
  COALESCE(users.cast_level_id, users.customer_level_id) AS user_level_id,
  users.guest_title AS user_guest_title
`;

export interface RankingQueryOptions {
  category: RankingCategory;
  period: RankingPeriod;
  userType: 'cast' | 'customer';
  viewerId: number;
  limit?: number;
}

/**
 * ProfilesController#ranking_credits — the 総合 / オーダー / スタンプ&特典P / 師匠
 * rankings, all four the same query with different category and amount columns.
 */
export async function creditsRanking(options: RankingQueryOptions): Promise<{
  rows: RankingRowRaw[];
  myRanking: RankingRowRaw | null;
}> {
  const range = periodRange(options.period);
  const isPatronForGuest = options.category === 'patron' && options.userType === 'customer';

  // which side of the transaction is the amount, and which user it belongs to
  const amountColumn = isPatronForGuest
    ? Prisma.sql`credit_transactions.credited_amount`
    : options.userType === 'cast'
      ? Prisma.sql`credit_transactions.credited_amount`
      : Prisma.sql`credit_transactions.charged_amount`;
  const joinColumn = isPatronForGuest
    ? Prisma.sql`credit_transactions.credited_user_id`
    : options.userType === 'cast'
      ? Prisma.sql`credit_transactions.credited_user_id`
      : Prisma.sql`credit_transactions.charged_user_id`;
  const userTypeClause =
    options.userType === 'cast'
      ? Prisma.sql`users.user_type = 'cast'::"UserType"`
      : Prisma.sql`users.user_type IN ${GUEST_TYPES}`;

  // the operator-set head start that is unioned into the sum
  const cheatColumn =
    options.category === 'meeting'
      ? Prisma.sql`users.meeting_ranking_cheat`
      : options.category === 'sticker'
        ? Prisma.sql`users.sticker_ranking_cheat`
        : isPatronForGuest
          ? Prisma.sql`0`
          : Prisma.sql`users.meeting_ranking_cheat + users.sticker_ranking_cheat`;

  const categories = CREDIT_CATEGORIES[isPatronForGuest ? 'patron' : options.category] ?? CREDIT_CATEGORIES.credits;

  const innerQuery = Prisma.sql`
    SELECT ${amountColumn} AS amount, ${USER_COLUMNS}
    FROM credit_transactions
    JOIN users ON users.id = ${joinColumn}
    WHERE ${userTypeClause}
      AND users.discarded_at IS NULL
      AND credit_transactions.category IN ${categories}
      AND ${timeClause('credit_transactions.created_at', range)}
    UNION ALL
    SELECT ${cheatColumn} AS amount, ${USER_COLUMNS}
    FROM users
    WHERE ${userTypeClause} AND users.discarded_at IS NULL
  `;

  const hiddenIds = options.userType === 'cast' ? await userIdsHiddenAtDeadline(creditsRankingDeadline(options.period)) : [];
  const hiddenClause = hiddenIds.length
    ? Prisma.sql`AND inner_query.user_id NOT IN (${Prisma.join(hiddenIds)})`
    : Prisma.empty;

  const grouped = (visibilityClause: Prisma.Sql) => Prisma.sql`
    SELECT SUM(inner_query.amount) AS score,
           inner_query.user_id, inner_query.user_type, inner_query.user_nick_name,
           inner_query.user_profile_pic, inner_query.user_birthday, inner_query.user_birthday_published,
           inner_query.user_level_id, inner_query.user_guest_title
    FROM (${innerQuery}) AS inner_query
    LEFT JOIN user_settings ON user_settings.user_id = inner_query.user_id
    WHERE ${visibilityClause}
    GROUP BY inner_query.user_id, inner_query.user_type, inner_query.user_nick_name,
             inner_query.user_profile_pic, inner_query.user_birthday, inner_query.user_birthday_published,
             inner_query.user_level_id, inner_query.user_guest_title
    HAVING SUM(inner_query.amount) > 0
  `;

  const publicVisibility = Prisma.sql`(user_settings.no_ranking = false OR user_settings.no_ranking IS NULL) ${hiddenClause}`;
  // the viewer is never hidden from themselves
  const myVisibility = Prisma.sql`((user_settings.no_ranking = false OR user_settings.no_ranking IS NULL) OR inner_query.user_id = ${options.viewerId})`;

  const rows = await prisma.$queryRaw<RankingRowRaw[]>(Prisma.sql`
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user_birthday ASC NULLS FIRST) AS position
    FROM (${grouped(publicVisibility)}) AS ranked
    ORDER BY score DESC, user_birthday ASC NULLS FIRST
    LIMIT ${options.limit ?? 30}
  `);

  const myRows = await prisma.$queryRaw<RankingRowRaw[]>(Prisma.sql`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user_birthday ASC NULLS FIRST) AS position
      FROM (${grouped(myVisibility)}) AS ranked_query
    ) AS final_query
    WHERE user_id = ${options.viewerId}
  `);

  return { rows, myRanking: myRows[0] ?? null };
}

/** ProfilesController#limited_event_campaign_for_period */
export async function limitedEventCampaignForPeriod(period: RankingPeriod) {
  const now = new Date();

  if (period === 'event_period') {
    const active = await prisma.eventCampaign.findFirst({
      where: { startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { startAt: 'desc' },
    });
    if (active) return active;
    return prisma.eventCampaign.findFirst({ where: { endAt: { lt: now } }, orderBy: { endAt: 'desc' } });
  }

  const dayChange = config.cast_like_day_change;
  let yesterdayEnd = tokyoStartOfDay(now, dayChange);
  if (tokyoParts(now).hour < dayChange) {
    yesterdayEnd = new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000);
  }

  let monthStart: Date;
  let monthEnd: Date;
  if (period === 'prev_month') {
    monthStart = tokyoStartOfMonth(tokyoPrevMonth(yesterdayEnd), dayChange);
    monthEnd = tokyoStartOfMonth(yesterdayEnd, dayChange);
  } else {
    monthStart = tokyoStartOfMonth(yesterdayEnd, dayChange);
    const next = new Date(monthEndNextMonth(yesterdayEnd));
    monthEnd = next;
  }

  return prisma.eventCampaign.findFirst({
    where: { startAt: { lt: monthEnd }, endAt: { gte: monthStart } },
    orderBy: { startAt: 'desc' },
  });
}

function monthEndNextMonth(date: Date): number {
  const t = tokyoParts(date);
  const year = t.month === 12 ? t.year + 1 : t.year;
  const month = t.month === 12 ? 1 : t.month + 1;
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`).getTime();
}

/**
 * ProfilesController#ranking_limited_event_gifts — cast ranked by the credits
 * *guests spent* on the campaign's gifts, so the display figure is
 * charged_amount rather than the cast's earnings.
 */
export async function limitedEventGiftRanking(options: RankingQueryOptions & { stickerTemplateIds?: number[] }): Promise<{
  rows: RankingRowRaw[];
  myRanking: RankingRowRaw | null;
  campaign: { id: number; name: string; startAt: Date; endAt: Date } | null;
}> {
  const campaign = await limitedEventCampaignForPeriod(options.period);

  let ids = options.stickerTemplateIds ?? [];
  if (!ids.length && campaign?.limitedStickerTemplateIds) {
    ids = campaign.limitedStickerTemplateIds
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id));
  }
  if (!ids.length) ids = [...config.limited_event_sticker_template_ids];

  if (!ids.length || !campaign) return { rows: [], myRanking: null, campaign: null };

  const innerQuery = Prisma.sql`
    SELECT credit_transactions.charged_amount AS amount, ${USER_COLUMNS}
    FROM credit_transactions
    JOIN stickers ON stickers.credit_transaction_id = credit_transactions.id
    JOIN users ON users.id = credit_transactions.credited_user_id
    WHERE users.user_type = 'cast'::"UserType"
      AND users.discarded_at IS NULL
      AND credit_transactions.category = 'sticker'::"CreditTransactionCategory"
      AND stickers.sticker_template_id IN (${Prisma.join(ids)})
      AND credit_transactions.created_at >= ${campaign.startAt}
      AND credit_transactions.created_at <= ${campaign.endAt}
  `;

  const hiddenIds = await userIdsHiddenAtDeadline(limitedEventRankingDeadline(campaign));
  const hiddenClause = hiddenIds.length
    ? Prisma.sql`AND inner_query.user_id NOT IN (${Prisma.join(hiddenIds)})`
    : Prisma.empty;

  const grouped = (visibilityClause: Prisma.Sql) => Prisma.sql`
    SELECT SUM(inner_query.amount) AS score,
           inner_query.user_id, inner_query.user_type, inner_query.user_nick_name,
           inner_query.user_profile_pic, inner_query.user_birthday, inner_query.user_birthday_published,
           inner_query.user_level_id, inner_query.user_guest_title
    FROM (${innerQuery}) AS inner_query
    LEFT JOIN user_settings ON user_settings.user_id = inner_query.user_id
    WHERE ${visibilityClause}
    GROUP BY inner_query.user_id, inner_query.user_type, inner_query.user_nick_name,
             inner_query.user_profile_pic, inner_query.user_birthday, inner_query.user_birthday_published,
             inner_query.user_level_id, inner_query.user_guest_title
    HAVING SUM(inner_query.amount) > 0
  `;

  const rows = await prisma.$queryRaw<RankingRowRaw[]>(Prisma.sql`
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user_birthday ASC NULLS FIRST) AS position
    FROM (${grouped(Prisma.sql`(user_settings.no_ranking = false OR user_settings.no_ranking IS NULL) ${hiddenClause}`)}) AS ranked
    ORDER BY score DESC, user_birthday ASC NULLS FIRST
    LIMIT ${options.limit ?? 30}
  `);

  const myRows = await prisma.$queryRaw<RankingRowRaw[]>(Prisma.sql`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user_birthday ASC NULLS FIRST) AS position
      FROM (${grouped(
        Prisma.sql`((user_settings.no_ranking = false OR user_settings.no_ranking IS NULL) OR inner_query.user_id = ${options.viewerId})`,
      )}) AS ranked_query
    ) AS final_query
    WHERE user_id = ${options.viewerId}
  `);

  return {
    rows,
    myRanking: myRows[0] ?? null,
    campaign: { id: campaign.id, name: campaign.name, startAt: campaign.startAt, endAt: campaign.endAt },
  };
}

/** ProfilesController#event_choco_period_range */
export async function eventChocoPeriodRange(period: RankingPeriod): Promise<{ start: Date; end: Date }> {
  const dayChange = config.cast_like_day_change;
  const now = new Date();
  let yesterdayEnd = tokyoStartOfDay(now, dayChange);
  if (tokyoParts(now).hour < dayChange) {
    yesterdayEnd = new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000);
  }

  switch (period) {
    case 'this_week':
      return { start: new Date(yesterdayEnd.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
    case 'this_month':
      return { start: tokyoStartOfMonth(yesterdayEnd, dayChange), end: now };
    case 'prev_month':
      return {
        start: tokyoStartOfMonth(tokyoPrevMonth(yesterdayEnd), dayChange),
        end: tokyoStartOfMonth(yesterdayEnd, dayChange),
      };
    case 'this_year':
      return { start: tokyoStartOfYear(yesterdayEnd, dayChange), end: now };
    case 'event_period': {
      const campaign =
        (await prisma.eventCampaign.findFirst({
          where: { startAt: { lte: now }, endAt: { gte: now } },
          orderBy: { startAt: 'desc' },
        })) ??
        (await prisma.eventCampaign.findFirst({ where: { endAt: { lt: now } }, orderBy: { endAt: 'desc' } }));
      if (campaign) {
        return { start: campaign.startAt, end: new Date(Math.min(campaign.endAt.getTime(), now.getTime())) };
      }
      const monthAgo = new Date(yesterdayEnd);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { start: monthAgo, end: now };
    }
    default:
      return { start: new Date(yesterdayEnd.getTime() - 24 * 60 * 60 * 1000), end: now };
  }
}

/**
 * ProfilesController#ranking_event_choco_received_count — guests ranked by the
 * *number* of campaign gifts received, counting only the overlap between each
 * campaign's window and the selected period.
 *
 * The original numbered this one in Ruby rather than with ROW_NUMBER() for MySQL
 * 5.7 compatibility; Postgres has the window function, so it is used here and the
 * ordering (count desc, birthday asc) is identical.
 */
export async function eventChocoReceivedCountRanking(options: RankingQueryOptions): Promise<{
  rows: RankingRowRaw[];
  myRanking: RankingRowRaw | null;
  campaign: { id: number; name: string; startAt: Date; endAt: Date } | null;
}> {
  const { start: periodStart, end: periodEnd } = await eventChocoPeriodRange(options.period);

  const campaigns = await prisma.eventCampaign.findMany({
    where: { startAt: { lte: periodEnd }, endAt: { gte: periodStart } },
    orderBy: { startAt: 'desc' },
  });
  if (!campaigns.length) return { rows: [], myRanking: null, campaign: null };

  const periodConditions = campaigns.map((campaign) => {
    const effectiveStart = new Date(Math.max(campaign.startAt.getTime(), periodStart.getTime()));
    const effectiveEnd = new Date(Math.min(campaign.endAt.getTime(), periodEnd.getTime()));
    return Prisma.sql`(
      stickers.sticker_template_id = ${campaign.stickerTemplateId}
      AND stickers.created_at >= ${effectiveStart}
      AND stickers.created_at <= ${effectiveEnd}
    )`;
  });

  const countSubquery = Prisma.sql`
    SELECT stickers.user_id, COUNT(*) AS choco_count
    FROM stickers
    JOIN users ON users.id = stickers.user_id
    LEFT JOIN user_settings ON user_settings.user_id = stickers.user_id
    WHERE users.user_type IN ${GUEST_TYPES}
      AND users.discarded_at IS NULL
      AND (user_settings.no_ranking = false OR user_settings.no_ranking IS NULL)
      AND (${Prisma.join(periodConditions, ' OR ')})
    GROUP BY stickers.user_id
  `;

  const base = Prisma.sql`
    SELECT inner_query.user_id AS user_id,
           inner_query.choco_count AS score,
           users.user_type AS user_type,
           users.nick_name AS user_nick_name,
           users.profile_pic_url AS user_profile_pic,
           users.birthday AS user_birthday,
           users.birthday_published AS user_birthday_published,
           users.join_date AS user_join_date,
           users.customer_level_id AS user_level_id,
           users.guest_title AS user_guest_title
    FROM (${countSubquery}) AS inner_query
    INNER JOIN users ON users.id = inner_query.user_id
  `;

  const ranked = await prisma.$queryRaw<RankingRowRaw[]>(Prisma.sql`
    SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user_birthday ASC NULLS FIRST) AS position
    FROM (${base}) AS ranked
    ORDER BY score DESC, user_birthday ASC NULLS FIRST
    LIMIT 1000
  `);

  const rows = ranked.slice(0, options.limit ?? 30);
  const myRanking = ranked.find((row) => row.user_id === options.viewerId) ?? null;
  const campaign = campaigns[0];

  return {
    rows,
    myRanking,
    campaign: { id: campaign.id, name: campaign.name, startAt: campaign.startAt, endAt: campaign.endAt },
  };
}
