import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
/**
 * Shared by the meetings route handlers: the schemas and query helpers
 * the original meetings.ts declared once and used from several actions.
 */

/**
 * Port of MeetingsController: the cast-facing order list, the order wizard, the
 * cast selection screen, arrive/finish, and reviews.
 */

export const MEETING_INCLUDE = {
  area: true,
  castRank: true,
  owner: { include: { castLevel: true, customerLevel: true } },
  castAttendances: true,
} satisfies Prisma.MeetingInclude;

/** The rescue branch both individual-order creators share. */
export async function failMeeting(meetingId: number): Promise<void> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { status: true } });
  if (meeting && !meeting.status.endsWith('_fail')) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: 'general_fail' } });
  }
}
