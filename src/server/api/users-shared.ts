import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
/**
 * Shared by the users route handlers: the schemas and query helpers
 * the original users.ts declared once and used from several actions.
 */

/**
 * Port of UsersController: signup (including the SMS verification interstitial),
 * the settings screens, blocking and the "pick at least 7 cast" onboarding step.
 */

export const signupSchema = z.object({
  nickName: z.string().min(1),
  email: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  passwordConfirmation: z.string().optional().nullable(),
  age: z.coerce.number().optional().nullable(),
  birthday: z.string().optional().nullable(),
  birthdayPublished: z.coerce.number().optional().nullable(),
  inviterCode: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  smsVerificationCode: z.string().optional().nullable(),
  /** written into the 対応 都道府県 attribute after creation */
  selfPrefectures: z.string().optional().nullable(),
  /** written into the 自己紹介 attribute after creation */
  selfIntroduction: z.string().optional().nullable(),
});

/**
 * The signup form writes two schema-driven attributes directly after creation,
 * as UsersController#create and CastController#create both did.
 */
export async function writeSignupAttributes(
  userId: number,
  body: { selfPrefectures?: string | null; selfIntroduction?: string | null },
): Promise<void> {
  if (body.selfPrefectures !== undefined && body.selfPrefectures !== null) {
    await prisma.attribute
      .update({ where: { userId_name: { userId, name: '対応 都道府県' } }, data: { value: body.selfPrefectures } })
      .catch(() => undefined);
  }
  if (body.selfIntroduction !== undefined && body.selfIntroduction !== null) {
    await prisma.attribute
      .update({ where: { userId_name: { userId, name: '自己紹介' } }, data: { value: body.selfIntroduction } })
      .catch(() => undefined);
  }
}
