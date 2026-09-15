import { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { toMeetingSummary, toUserCard, type MeetingRow } from '@/server/lib/serializers';
import { rewardForReviews } from '@/server/services/rewards';
import { receiveReviewMessage } from '@/server/services/auto-send-message';
import { giveSticker } from '@/server/services/stickers';
import { requireUser } from '@/server/auth/session';
import { jsonBody, route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id/review */
export const GET = route<{ id: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: { castAttendances: { include: { user: { include: { castLevel: true } } } }, owner: true },
  });

  if (!['finished', 'completed'].includes(meeting.status)) {
    throw new AppError('待ち合わせのレビューはまだできません。', { redirect: '/home' });
  }
  const active = meeting.castAttendances.filter((attendance) => attendance.role !== 'out');
  const isParticipant = meeting.ownerId === user.id || active.some((a) => a.userId === user.id);
  if (!isParticipant) throw new ForbiddenError('権利がありません。', '/home');

  const revieweeIds = meeting.ownerId === user.id ? active.map((a) => a.userId) : [meeting.ownerId];
  const existing = await prisma.review.findMany({
    where: { meetingId: meeting.id, reviewerId: user.id, revieweeId: { in: revieweeIds } },
  });

  // cast may attach a badge to their review of the guest
  const stickerTemplates =
    meeting.ownerId === user.id
      ? []
      : await prisma.stickerTemplate.findMany({
          where: { active: true, price: 0, businessAreaId: user.businessAreaId ?? undefined },
          orderBy: { id: 'asc' },
        });

  return {
    meeting: toMeetingSummary(meeting as unknown as MeetingRow),
    reviews: revieweeIds.map((revieweeId) => {
      const found = existing.find((review) => review.revieweeId === revieweeId);
      const reviewee =
        revieweeId === meeting.ownerId
          ? meeting.owner
          : active.find((a) => a.userId === revieweeId)?.user ?? null;
      return {
        revieweeId,
        reviewee: reviewee ? toUserCard(reviewee) : null,
        stars: found?.stars ?? null,
        comment: found?.comment ?? null,
        persisted: !!found,
      };
    }),
    stickerTemplates: stickerTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      pictureUrl: template.pictureUrl,
      price: template.price,
      free: template.price === 0,
      eventCampaign: null,
    })),
  };
});

/** meetings: POST /meetings/:id/review */
export const POST = route<{ id: string }>(async (request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z.object({ id: z.coerce.number() }).parse(routeParams);
  const body = z
    .object({
      reviews: z.array(
        z.object({
          revieweeId: z.coerce.number(),
          stars: z.coerce.number().int().min(1).max(5),
          comment: z.string().optional().nullable(),
          stickerId: z.coerce.number().optional().nullable(),
        }),
      ),
    })
    .parse(await jsonBody(request));

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: params.id },
    include: { castAttendances: true },
  });
  if (!['finished', 'completed'].includes(meeting.status)) {
    throw new AppError('待ち合わせのレビューはまだできません。', { redirect: '/home' });
  }
  const active = meeting.castAttendances.filter((attendance) => attendance.role !== 'out');
  const isParticipant = meeting.ownerId === user.id || active.some((a) => a.userId === user.id);
  if (!isParticipant) throw new ForbiddenError('権利がありません。', '/home');

  const participantIds = new Set([meeting.ownerId, ...active.map((a) => a.userId)]);

  for (const entry of body.reviews) {
    // Review validations
    if (!participantIds.has(entry.revieweeId)) throw new AppError('reviewee does not belong to meeting');
    if (entry.revieweeId === user.id) throw new AppError("reviewer can't review themselves");

    const reviewee = await prisma.user.findUniqueOrThrow({ where: { id: entry.revieweeId } });
    if (user.userType === 'cast' && reviewee.userType === 'cast') {
      throw new AppError("cast can't review cast");
    }

    const existing = await prisma.review.findFirst({
      where: { meetingId: meeting.id, reviewerId: user.id, revieweeId: entry.revieweeId },
    });
    if (existing) continue; // already reviewed: skip, as the original did

    const review = await prisma.review.create({
      data: {
        meetingId: meeting.id,
        reviewerId: user.id,
        revieweeId: entry.revieweeId,
        stars: entry.stars,
        comment: entry.comment ?? null,
      },
    });

    await rewardForReviews({ ...review, stars: entry.stars });
    await receiveReviewMessage({
      stars: entry.stars,
      comment: entry.comment ?? null,
      reviewee: {
        id: reviewee.id,
        nickName: reviewee.nickName,
        userType: reviewee.userType,
        inviterId: reviewee.inviterId,
      },
      reviewer: {
        id: user.id,
        nickName: user.nickName,
        userType: user.userType,
        inviterId: user.inviterId,
      },
    });

    if (entry.stickerId) {
      await giveSticker({
        buyerId: user.id,
        recipientId: meeting.ownerId,
        templateId: entry.stickerId,
        reviewId: review.id,
      });
    }
  }

  return {
    ok: true,
    redirect: '/conversations',
    flash: { type: 'notice', message: 'レビューありがとうございます。' },
  };
});
