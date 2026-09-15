import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { hashPassword } from '@/server/lib/auth';
import { toUserCard, type MeetingRow } from '@/server/lib/serializers';
import { toMeetingSummary } from '@/server/lib/serializers';
import { requireAdmin } from '@/server/api/admin-scope';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** admin: GET /admin/users/:id */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: params.id },
    include: {
      castLevel: true,
      customerLevel: true,
      businessArea: true,
      settings: true,
      castBankAccount: true,
      creditCard: true,
      accessRequest: true,
      inviter: { select: { id: true, nickName: true, userType: true } },
      userAttributes: { orderBy: { name: 'asc' } },
      userAssessments: true,
      userTrophies: { include: { trophy: true } },
      payoutRequests: { orderBy: { id: 'desc' }, take: 20 },
    },
  });

  const [meetings, transactions, notes, reviews] = await Promise.all([
    prisma.meeting.findMany({
      where: { OR: [{ ownerId: user.id }, { castAttendances: { some: { userId: user.id } } }] },
      include: { area: true, castRank: true, castAttendances: true },
      orderBy: { plannedStartTime: 'desc' },
      take: 20,
    }),
    prisma.creditTransaction.findMany({
      where: { OR: [{ chargedUserId: user.id }, { creditedUserId: user.id }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.note.findMany({
      where: { itemType: 'User', itemId: user.id },
      include: { admin: { select: { loginName: true } } },
      orderBy: { id: 'desc' },
    }),
    prisma.review.findMany({
      where: { revieweeId: user.id },
      include: { reviewer: { select: { id: true, nickName: true } } },
      orderBy: { id: 'desc' },
      take: 20,
    }),
  ]);

  return {
    user: {
      ...toUserCard(user),
      email: user.email,
      phone: user.phone,
      realName: user.realName,
      accessLevel: user.accessLevel,
      creditBalance: user.creditBalance,
      frozenCredits: user.frozenCredits,
      serviceFeePermille: user.serviceFeePermille,
      firstExperienceRewardPermille: user.firstExperienceRewardPermille,
      meetingRankingCheat: user.meetingRankingCheat,
      stickerRankingCheat: user.stickerRankingCheat,
      additionalScore: user.additionalScore,
      individualRepeatCount: user.individualRepeatCount,
      guestTitle: user.guestTitle,
      businessAreaId: user.businessAreaId,
      businessAreaName: user.businessArea?.name ?? null,
      castLevelId: user.castLevelId,
      customerLevelId: user.customerLevelId,
      discardedAt: user.discardedAt?.toISOString() ?? null,
      inviter: user.inviter,
      adSource: user.adSource,
      snsId: user.snsId,
      creditcardToken: user.creditcardToken ? `${user.creditcardToken.slice(0, 4)}…` : null,
      publicProfile: user.publicProfile,
      firstPrivatelyMetUserId: user.firstPrivatelyMetUserId,
      firstPrivatelyMetAt: user.firstPrivatelyMetAt?.toISOString() ?? null,
    },
    settings: user.settings,
    bankAccount: user.castBankAccount,
    creditCard: user.creditCard
      ? {
          status: user.creditCard.status,
          maskedCardNumber: user.creditCard.maskedCardNumber,
          expiryYear: user.creditCard.expiryYear,
          expiryMonth: user.creditCard.expiryMonth,
          nameOnCard: user.creditCard.nameOnCard,
        }
      : null,
    accessRequest: user.accessRequest,
    attributes: user.userAttributes,
    assessments: user.userAssessments,
    trophies: user.userTrophies.map((link) => link.trophy),
    payoutRequests: user.payoutRequests,
    meetings: meetings.map((meeting) => toMeetingSummary(meeting as unknown as MeetingRow)),
    transactions,
    notes: notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      adminName: note.admin?.loginName ?? null,
    })),
    reviews,
  };
});

/** admin: PATCH /admin/users/:id */
export const PATCH = route<{ id: string }>(async (request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      nickName: z.string().optional(),
      realName: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      accessLevel: z.string().optional(),
      userType: z.string().optional(),
      businessAreaId: z.coerce.number().nullable().optional(),
      castLevelId: z.coerce.number().nullable().optional(),
      customerLevelId: z.coerce.number().nullable().optional(),
      serviceFeePermille: z.coerce.number().nullable().optional(),
      orderFeePerTime: z.coerce.number().nullable().optional(),
      firstExperienceRewardPermille: z.coerce.number().optional(),
      meetingRankingCheat: z.coerce.number().optional(),
      stickerRankingCheat: z.coerce.number().optional(),
      additionalScore: z.coerce.number().optional(),
      guestTitle: z.string().nullable().optional(),
      publicProfile: z.boolean().optional(),
      motto: z.string().nullable().optional(),
      birthday: z.string().nullable().optional(),
      birthdayPublished: z.coerce.number().nullable().optional(),
      inviterId: z.coerce.number().nullable().optional(),
      password: z.string().optional(),
    })
    .parse(await jsonBody(request));

  const data: Prisma.UserUpdateInput = {
    ...(body.nickName !== undefined ? { nickName: body.nickName } : {}),
    ...(body.realName !== undefined ? { realName: body.realName } : {}),
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(body.accessLevel !== undefined ? { accessLevel: body.accessLevel as never } : {}),
    ...(body.userType !== undefined ? { userType: body.userType as never } : {}),
    ...(body.businessAreaId !== undefined ? { businessAreaId: body.businessAreaId } : {}),
    ...(body.castLevelId !== undefined ? { castLevelId: body.castLevelId } : {}),
    ...(body.customerLevelId !== undefined ? { customerLevelId: body.customerLevelId } : {}),
    ...(body.serviceFeePermille !== undefined ? { serviceFeePermille: body.serviceFeePermille } : {}),
    ...(body.orderFeePerTime !== undefined ? { orderFeePerTime: body.orderFeePerTime } : {}),
    ...(body.firstExperienceRewardPermille !== undefined
      ? { firstExperienceRewardPermille: body.firstExperienceRewardPermille }
      : {}),
    ...(body.meetingRankingCheat !== undefined ? { meetingRankingCheat: body.meetingRankingCheat } : {}),
    ...(body.stickerRankingCheat !== undefined ? { stickerRankingCheat: body.stickerRankingCheat } : {}),
    ...(body.additionalScore !== undefined ? { additionalScore: body.additionalScore } : {}),
    ...(body.guestTitle !== undefined ? { guestTitle: body.guestTitle } : {}),
    ...(body.publicProfile !== undefined ? { publicProfile: body.publicProfile } : {}),
    ...(body.motto !== undefined ? { motto: body.motto } : {}),
    ...(body.birthday !== undefined ? { birthday: body.birthday ? new Date(body.birthday) : null } : {}),
    ...(body.birthdayPublished !== undefined ? { birthdayPublished: body.birthdayPublished } : {}),
    ...(body.inviterId !== undefined ? { inviterId: body.inviterId } : {}),
    ...(body.password ? { passwordDigest: await hashPassword(body.password) } : {}),
  };

  await prisma.user.update({ where: { id: params.id }, data });
  return { ok: true };
});

/**
 * admin: DELETE /admin/users/:id — 退会.
 *
 * Besides hiding the account, the email and LINE id are prefixed so they stop
 * matching a login and the person can register again with them. 復元 hands out
 * fresh credentials rather than undoing the prefix.
 */
export const DELETE = route<{ id: string }>(async (_request, { params: routeParams }) => {
  await requireAdmin();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: params.id },
    select: { id: true, email: true, snsId: true },
  });
  const prefix = `deleted___user__${user.id}__`;
  const withdrawn = (value: string | null) => (value && !value.startsWith(prefix) ? `${prefix}${value}` : value);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessLevel: 'ceased',
      email: withdrawn(user.email),
      snsId: withdrawn(user.snsId),
      discardedAt: new Date(),
      loggedOut: true,
      authToken: null,
      rememberToken: null,
    },
  });
  return { ok: true };
});
