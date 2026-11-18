import { prisma } from '@/server/lib/prisma';
import { setupCastSelection } from '@/server/services/meetings/selection';
import { asParams, railsToInt, requestParams } from '@/server/http/params';
import {
  internalApiRoute,
  railsBadRequest,
  railsServerError,
  RailsParameterMissing,
  RailsRecordNotFound,
} from '@/server/http/internal-api';
export const dynamic = 'force-dynamic';

const ROLES = ['attending', 'unconfirmed', 'requested', 'out'];

/**
 * internal-api: POST /internal_api/meetings/:meetingId/add_cast
 *
 * `cast_attendance[...]`, as the attendance panel posts it. The old action wrapped
 * its body in `rescue => e`, so every failure is a 500 carrying the Ruby message —
 * including the enum setter's `'bogus' is not a valid role` — except the duplicate,
 * which it rendered itself with a 400, and the missing parameter group, which
 * `params.require` turned into a 400 before the action ran.
 */
export const POST = internalApiRoute<{ meetingId: string }>(async (request, { params }) => {
  const body = await requestParams(request);
  if (body.cast_attendance === undefined) throw new RailsParameterMissing('cast_attendance');
  const attendance = asParams(body.cast_attendance);

  const role = attendance.role;
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    throw railsServerError(`'${role === undefined ? '' : String(role)}' is not a valid role`);
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: railsToInt(params.meetingId) } });
  if (!meeting) throw new RailsRecordNotFound();

  try {
    await prisma.castAttendance.create({
      data: {
        meetingId: meeting.id,
        userId: railsToInt(attendance.user_id),
        role: role as never,
        additionalScore: railsToInt(attendance.additional_score),
        decisionBy: 'operator',
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      throw railsBadRequest('キャストは既に参加します');
    }
    throw railsServerError((error as Error).message);
  }

  // safe to call repeatedly: it only acts while the status is still 'requested'
  const activeCount = await prisma.castAttendance.count({
    where: { meetingId: meeting.id, role: { not: 'out' } },
  });
  if (activeCount >= meeting.neededPersonCount) await setupCastSelection(meeting.id);
});
