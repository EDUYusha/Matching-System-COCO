import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import { AppError, ForbiddenError } from '@/server/lib/errors';
import { toCastAttendanceDto } from '@/server/lib/serializers';
import { requireUser } from '@/server/auth/session';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** meetings: GET /meetings/:id/cast/:castAttendanceId */
export const GET = route<{ id: string; castAttendanceId: string }>(async (_request, { params: routeParams }) => {
  const user = await requireUser();
  const params = z
    .object({ id: z.coerce.number(), castAttendanceId: z.coerce.number() })
    .parse(routeParams);

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.id } });
  if (meeting.ownerId !== user.id) throw new ForbiddenError('権利がありません', '/conversations');
  if (meeting.status !== 'cast_selectable') {
    throw new AppError('Cast selection time is already over.', { redirect: '/home' });
  }

  const attendance = await prisma.castAttendance.findUniqueOrThrow({
    where: { id: params.castAttendanceId },
    include: { user: { include: { castLevel: true, userAttributes: true } } },
  });

  const pictures = await prisma.picture.findMany({
    where: { userId: attendance.userId, public: true },
    orderBy: { profilePic: 'desc' },
  });
  const team = attendance.leaderId
    ? await prisma.castAttendance.findMany({
        where: { meetingId: meeting.id, leaderId: attendance.leaderId },
        include: { user: { include: { castLevel: true } } },
      })
    : [];

  const stickerCounts = config.show_stickers_on_profile
    ? await prisma.sticker.groupBy({
        by: ['stickerTemplateId'],
        where: { userId: attendance.userId },
        _count: { _all: true },
      })
    : [];
  const templates = stickerCounts.length
    ? await prisma.stickerTemplate.findMany({
        where: { id: { in: stickerCounts.map((row) => row.stickerTemplateId) } },
      })
    : [];

  const reviewStats = config.show_review_summary_on_profile
    ? await prisma.review.aggregate({
        where: { revieweeId: attendance.userId },
        _avg: { stars: true },
        _count: { _all: true },
      })
    : null;

  const { pictureUrl } = await import('@/server/services/users');

  return {
    attendance: toCastAttendanceDto(attendance, {
      attributes: attendance.user.userAttributes.map((attribute) => ({
        name: attribute.name,
        value: attribute.value,
      })),
    }),
    pictures: pictures.map((picture) => ({
      id: picture.id,
      url: pictureUrl(picture) ?? '/system/noimage.png',
      profilePic: picture.profilePic,
      public: picture.public,
    })),
    team: team.map((member) => toCastAttendanceDto(member)),
    stickers: stickerCounts.map((row) => {
      const template = templates.find((candidate) => candidate.id === row.stickerTemplateId);
      return {
        stickerTemplateId: row.stickerTemplateId,
        name: template?.name ?? '',
        pictureUrl: template?.pictureUrl ?? '',
        count: row._count._all,
      };
    }),
    reviewStats:
      reviewStats && reviewStats._count._all > 0
        ? { average: reviewStats._avg.stars ?? 0, count: reviewStats._count._all }
        : null,
  };
});
