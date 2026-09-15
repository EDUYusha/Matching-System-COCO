import { z } from 'zod';
import { config } from '@/lib';
import { prisma } from '@/server/lib/prisma';
import {
  enqueueAutoOpenMeeting,
  enqueueRemindMeetingArrival,
  enqueueRemindMeetingEnd,
  enqueueRemindMeetingStart,
  enqueueRemindSelectionEnd,
  JOBS,
  removeMeetingJobs
} from '@/server/jobs/queues';
import { route } from '@/server/http/route';
export const dynamic = 'force-dynamic';

/** internal-api: POST /internal_api/meetings/:meetingId/reschedule_jobs */
export const POST = route<{ meetingId: string }>(async (_request, { params: routeParams }) => {
  const params = z.object({ meetingId: z.coerce.number() }).parse(routeParams);
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: params.meetingId } });

  if (meeting.status === 'requested' || meeting.status === 'cast_selectable') {
    await removeMeetingJobs(meeting.id, [
      JOBS.autoOpenMeeting,
      JOBS.remindSelectionEnd,
      JOBS.remindMeetingStart,
      JOBS.remindMeetingArrival,
    ]);

    if (meeting.requestEndTime) {
      await enqueueAutoOpenMeeting(meeting.id, meeting.requestEndTime);
      const remindAt = new Date(
        meeting.requestEndTime.getTime() - config.remind_time_before_selection_end * 1000,
      );
      if (remindAt.getTime() > Date.now()) await enqueueRemindSelectionEnd(meeting.id, remindAt);
    }
    if (config.remind_time_before_meeting_start) {
      await enqueueRemindMeetingStart(
        meeting.id,
        new Date(meeting.plannedStartTime.getTime() - config.remind_time_before_meeting_start * 1000),
      );
    }
    if (config.remind_time_after_meeting_start) {
      await enqueueRemindMeetingArrival(
        meeting.id,
        new Date(meeting.plannedStartTime.getTime() + config.remind_time_after_meeting_start * 1000),
      );
    }
  } else if (meeting.status === 'in_progress') {
    await removeMeetingJobs(meeting.id, [JOBS.remindMeetingEnd]);

    const diff = config.remind_time_before_meeting_end;
    if (diff && meeting.plannedEndTime.getTime() > Date.now() + diff * 1000) {
      const arrived = await prisma.castAttendance.findMany({
        where: { meetingId: meeting.id, role: { not: 'out' }, startTime: { not: null } },
      });
      const plannedLengthMs = meeting.plannedEndTime.getTime() - meeting.plannedStartTime.getTime();

      for (const attendance of arrived) {
        if (
          attendance.startTime! > meeting.plannedStartTime ||
          config.costs_for_being_early ||
          config.only_consider_attendance_time_spans_for_costs
        ) {
          await enqueueRemindMeetingEnd(
            meeting.id,
            attendance.id,
            new Date(attendance.startTime!.getTime() + plannedLengthMs - diff * 1000),
          );
        }
      }

      const anyOnTime = arrived.some((attendance) => attendance.startTime! <= meeting.plannedStartTime);
      if (
        !(config.costs_for_being_early || config.only_consider_attendance_time_spans_for_costs) &&
        anyOnTime
      ) {
        await enqueueRemindMeetingEnd(
          meeting.id,
          null,
          new Date(meeting.plannedEndTime.getTime() - diff * 1000),
        );
      }
    }
  }

  return { ok: true };
});
