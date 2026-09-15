import { Prisma } from '@prisma/client';
import { config, tokyoParts } from '@/lib';

/**
 * Port of ProfileSearchQuery.
 *
 * Most filters are EXISTS subqueries against `attributes` or
 * `meeting_preferences`, because the searchable facts live in those
 * schema-driven tables rather than on `users`. The Japanese attribute names are
 * the keys the schema actually uses, so they stay as literals.
 *
 * One deliberate change: the height filter cast with MySQL's
 * `CAST(value AS UNSIGNED)`, which silently yields 0 for non-numeric text.
 * Postgres would raise instead, so digits are extracted before casting — same
 * practical result, no 500 on a row like "165cm".
 */

export interface ProfileSearchParams {
  favorites_only?: string;
  user_type?: string;
  height?: string;
  height_variance?: string;
  min_age?: string;
  max_age?: string;
  size?: string;
  status?: string;
  order_fee_per_time_lower_limit?: string;
  order_fee_per_time_upper_limit?: string;
  business_area_id?: string;
  income?: string;
  drinking_place?: string;
  cast_level_id?: string;
  nick_name?: string;
  new_cast?: string;
  age_class?: string;
  size_class?: string;
  style_class?: string;
  looks_class?: string;
  type_class?: string;
  work_class?: string;
  smoking_class?: string;
  can_speak_english?: string;
}

/** The `*_class` params map onto MeetingPreferencesSchema subcategories. */
const CLASS_PARAM_TO_SUBCATEGORY: Record<string, string> = {
  age_class: '年齢',
  size_class: '身長',
  style_class: 'スタイル',
  looks_class: 'ルックス',
  type_class: 'タイプ',
  work_class: '職業',
  smoking_class: 'タバコ',
};

function attributeExists(name: string, valueClause: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM attributes
    WHERE attributes.user_id = users.id AND attributes.name = ${name} AND ${valueClause}
  )`;
}

function preferenceExists(clause: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM meeting_preferences
    JOIN meeting_preferences_schema mps ON meeting_preferences.parent_id = mps.id
    WHERE meeting_preferences.user_id = users.id AND ${clause}
  )`;
}

/**
 * Builds the WHERE fragments for a search. Returns SQL rather than a Prisma
 * `where` object because several filters are correlated subqueries Prisma cannot
 * express.
 */
export function profileSearchConditions(
  params: ProfileSearchParams | null | undefined,
  viewer: { id: number },
): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [];
  if (!params) return conditions;

  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const value = String(rawValue);

    switch (key) {
      case 'favorites_only': {
        if (value !== '1') break;
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM favorites
          WHERE favorites.target_id = users.id AND favorites.user_id = ${viewer.id}
        )`);
        break;
      }
      case 'user_type': {
        conditions.push(Prisma.sql`users.user_type = ${value}::"UserType"`);
        break;
      }
      case 'height': {
        const height = Number(value);
        if (!Number.isFinite(height)) break;
        const variance = Number(params.height_variance ?? 5) || 5;
        conditions.push(
          attributeExists(
            '身長',
            Prisma.sql`NULLIF(regexp_replace(attributes.value, '\\D', '', 'g'), '')::bigint
              BETWEEN ${height - variance} AND ${height + variance}`,
          ),
        );
        break;
      }
      case 'min_age': {
        const age = Number(value);
        if (!Number.isFinite(age) || age <= 20) break;
        const today = tokyoParts(new Date());
        const lowerBound = `${today.year - age}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
        conditions.push(Prisma.sql`users.birthday <= ${lowerBound}::date`);
        break;
      }
      case 'max_age': {
        const age = Number(value);
        if (!Number.isFinite(age) || age >= 50) break;
        const today = tokyoParts(new Date());
        const upperBound = `${today.year - age - 1}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
        conditions.push(Prisma.sql`users.birthday > ${upperBound}::date`);
        break;
      }
      case 'size': {
        conditions.push(attributeExists('スタイル', Prisma.sql`attributes.value = ${value}`));
        break;
      }
      case 'status': {
        if (value === 'online') {
          const threshold = new Date(Date.now() - 30 * 60 * 1000);
          conditions.push(Prisma.sql`users.logged_out = false AND users.last_activity > ${threshold}`);
        } else if (value === 'offline') {
          conditions.push(Prisma.sql`users.logged_out = true`);
        }
        break;
      }
      case 'order_fee_per_time_lower_limit': {
        const limit = Number(value);
        if (limit > 0) conditions.push(Prisma.sql`users.order_fee_per_time > ${limit}`);
        break;
      }
      case 'order_fee_per_time_upper_limit': {
        const limit = Number(value);
        if (limit < 30000) conditions.push(Prisma.sql`users.order_fee_per_time < ${limit}`);
        break;
      }
      case 'business_area_id': {
        conditions.push(Prisma.sql`users.business_area_id = ${Number(value)}`);
        break;
      }
      case 'income': {
        conditions.push(attributeExists('年収', Prisma.sql`attributes.value = ${value}`));
        break;
      }
      case 'drinking_place': {
        conditions.push(attributeExists('よく飲む地域', Prisma.sql`attributes.value LIKE ${`%${value}%`}`));
        break;
      }
      case 'cast_level_id': {
        conditions.push(Prisma.sql`users.cast_level_id = ${Number(value)}`);
        break;
      }
      case 'nick_name': {
        conditions.push(Prisma.sql`users.nick_name LIKE ${`%${value}%`}`);
        break;
      }
      case 'new_cast': {
        if (value !== '1') break;
        const threshold = new Date(Date.now() - config.cast_new_duration * 1000);
        conditions.push(Prisma.sql`users.join_date > ${threshold.toISOString().slice(0, 10)}::date`);
        break;
      }
      case 'can_speak_english': {
        if (value !== '1') break;
        conditions.push(preferenceExists(Prisma.sql`mps.name = '英語OK'`));
        break;
      }
      default: {
        const subcategory = CLASS_PARAM_TO_SUBCATEGORY[key];
        if (subcategory) {
          conditions.push(
            preferenceExists(Prisma.sql`mps.subcategory = ${subcategory} AND mps.name = ${value}`),
          );
        }
        // unknown keys are ignored, as in the original's empty else branch
        break;
      }
    }
  }

  return conditions;
}

/** Which user types a viewer is allowed to search for (ProfilesController#search). */
export function searchableUserTypes(viewerUserType: string): string[] | null {
  if (viewerUserType === 'cast') return ['customer', 'inviter'];
  if (viewerUserType === 'customer' || viewerUserType === 'inviter') return ['cast'];
  return null;
}

export interface ProfileSearchResult {
  ids: number[];
  totalCount: number;
}

/**
 * Runs the search. Returns ids so the caller can load the rows with Prisma's
 * normal includes, which keeps the serialisation in one place.
 */
export async function searchProfileIds(
  client: { $queryRaw: <T>(query: Prisma.Sql) => Promise<T> },
  viewer: { id: number; userType: string },
  params: ProfileSearchParams | null | undefined,
  pagination: { skip: number; take: number },
): Promise<ProfileSearchResult> {
  const userTypes = searchableUserTypes(viewer.userType);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`users.discarded_at IS NULL`,
    Prisma.sql`users.public_profile = true`,
  ];
  if (userTypes) {
    conditions.push(
      Prisma.sql`users.user_type IN (${Prisma.join(userTypes.map((type) => Prisma.sql`${type}::"UserType"`))})`,
    );
  }
  conditions.push(...profileSearchConditions(params, viewer));

  const where = Prisma.join(conditions, ' AND ');

  const rows = await client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT users.id
    FROM users
    WHERE ${where}
    ORDER BY users.last_login DESC NULLS LAST, users.id DESC
    LIMIT ${pagination.take} OFFSET ${pagination.skip}
  `);

  const countRows = await client.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS count FROM users WHERE ${where}
  `);

  return {
    ids: rows.map((row) => row.id),
    totalCount: Number(countRows[0]?.count ?? 0),
  };
}
