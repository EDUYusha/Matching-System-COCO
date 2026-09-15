import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';

/**
 * BullMQ replacement for Sidekiq.
 *
 * One queue per Sidekiq queue name (default / mailers / cron) and one job name
 * per worker class, so `AutoOpenMeetingWorker.perform_at(t, id)` becomes
 * `enqueueAutoOpenMeeting(id, t)`.
 *
 * Deterministic job ids matter: InternalApi::MeetingsController#reschedule_jobs
 * walked Sidekiq::ScheduledSet to delete the pending jobs for one meeting before
 * re-adding them. Naming jobs `<job>:<meetingId>` lets us remove them directly
 * instead of scanning.
 */

export const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
connection.on('error', (error) => logger.error({ error }, 'redis connection error'));

export const QUEUE_DEFAULT = 'default';
export const QUEUE_MAILERS = 'mailers';
export const QUEUE_CRON = 'cron';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
  removeOnFail: { count: 5000 },
};

export const defaultQueue = new Queue(QUEUE_DEFAULT, { connection, defaultJobOptions });
export const mailersQueue = new Queue(QUEUE_MAILERS, { connection, defaultJobOptions });
/** `sidekiq_options retry: 0` on all three cron workers. */
export const cronQueue = new Queue(QUEUE_CRON, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
});

export const JOBS = {
  messageBroadcast: 'MessageBroadcastWorker',
  meetingBroadcast: 'MeetingBroadcastWorker',
  autoOpenMeeting: 'AutoOpenMeetingWorker',
  remindSelectionEnd: 'RemindSelectionEndWorker',
  remindMeetingStart: 'RemindMeetingStartWorker',
  remindMeetingArrival: 'RemindMeetingArrivalWorker',
  remindMeetingEnd: 'RemindMeetingEndWorker',
  informRead: 'InformReadWorker',
  openReviewModal: 'OpenReviewModalWorker',
  completeMeeting: 'CompleteMeetingWorker',
  finishMeeting: 'FinishMeetingWorker',
  sendMail: 'ActionMailer',
  collectPostRewards: 'CollectPostRewardsWorker',
  handleInactiveNewCustomers: 'HandleInactiveNewCustomersWorker',
  reapInactivePatrons: 'ReapInactivePatronsWorker',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

/**
 * Job ids are `<JobName>--<meetingId>`. BullMQ rejects `:` in a custom id, so the
 * separator differs from the ActionCable stream names, which do use colons.
 */
const JOB_ID_SEPARATOR = '--';

export function meetingJobId(jobName: JobName, meetingId: number, suffix?: string | number): string {
  return [jobName, meetingId, ...(suffix === undefined ? [] : [suffix])].join(JOB_ID_SEPARATOR);
}

/** Sidekiq's perform_at: a delay in ms, never negative. */
function delayUntil(when: Date | null | undefined): number | undefined {
  if (!when) return undefined;
  return Math.max(0, when.getTime() - Date.now());
}

// --- chat -----------------------------------------------------------------

export interface MessageBroadcastPayload {
  messageId: number;
  recipientIds?: number[] | null;
}

export async function enqueueMessageBroadcast(messageId: number, recipientIds?: number[] | null): Promise<void> {
  await defaultQueue.add(JOBS.messageBroadcast, { messageId, recipientIds } satisfies MessageBroadcastPayload);
}

export interface InformReadPayload {
  conversationId: number;
  readerId: number;
  messageIds: number[];
}

export async function enqueueInformRead(payload: InformReadPayload): Promise<void> {
  if (!payload.messageIds.length) return;
  await defaultQueue.add(JOBS.informRead, payload);
}

// --- meetings -------------------------------------------------------------

export interface MeetingBroadcastPayload {
  meetingId: number;
  /** null | 'all' | 'available' | 'none' — who gets the push/LINE notification */
  scope?: string | null;
}

export async function enqueueMeetingBroadcast(meetingId: number, scope?: string | null): Promise<void> {
  await defaultQueue.add(JOBS.meetingBroadcast, { meetingId, scope } satisfies MeetingBroadcastPayload);
}

export async function enqueueAutoOpenMeeting(meetingId: number, at?: Date | null): Promise<void> {
  await defaultQueue.add(
    JOBS.autoOpenMeeting,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.autoOpenMeeting, meetingId) },
  );
}

export async function enqueueRemindSelectionEnd(meetingId: number, at: Date): Promise<void> {
  await defaultQueue.add(
    JOBS.remindSelectionEnd,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.remindSelectionEnd, meetingId) },
  );
}

export async function enqueueRemindMeetingStart(meetingId: number, at: Date): Promise<void> {
  await defaultQueue.add(
    JOBS.remindMeetingStart,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.remindMeetingStart, meetingId) },
  );
}

export async function enqueueRemindMeetingArrival(meetingId: number, at: Date): Promise<void> {
  await defaultQueue.add(
    JOBS.remindMeetingArrival,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.remindMeetingArrival, meetingId) },
  );
}

export async function enqueueRemindMeetingEnd(
  meetingId: number,
  castAttendanceId: number | null,
  at: Date,
): Promise<void> {
  await defaultQueue.add(
    JOBS.remindMeetingEnd,
    { meetingId, castAttendanceId },
    {
      delay: delayUntil(at),
      jobId: meetingJobId(JOBS.remindMeetingEnd, meetingId, castAttendanceId ?? 'all'),
    },
  );
}

export async function enqueueOpenReviewModal(meetingId: number): Promise<void> {
  await defaultQueue.add(JOBS.openReviewModal, { meetingId });
}

export async function enqueueCompleteMeeting(meetingId: number, at?: Date | null): Promise<void> {
  await defaultQueue.add(
    JOBS.completeMeeting,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.completeMeeting, meetingId) },
  );
}

export async function enqueueFinishMeeting(meetingId: number, at?: Date | null): Promise<void> {
  await defaultQueue.add(
    JOBS.finishMeeting,
    { meetingId },
    { delay: delayUntil(at), jobId: meetingJobId(JOBS.finishMeeting, meetingId) },
  );
}

/**
 * The delete half of reschedule_jobs. Sidekiq deleted by scanning the scheduled
 * set for jobs whose first argument matched the meeting id; here the id is in the
 * job key, so removal is a direct lookup.
 */
export async function removeMeetingJobs(meetingId: number, jobNames: JobName[]): Promise<void> {
  for (const jobName of jobNames) {
    const job = await defaultQueue.getJob(meetingJobId(jobName, meetingId));
    if (job) await job.remove().catch(() => undefined);

    // RemindMeetingEndWorker is also scheduled per cast attendance
    if (jobName === JOBS.remindMeetingEnd) {
      const prefix = `${meetingJobId(JOBS.remindMeetingEnd, meetingId)}${JOB_ID_SEPARATOR}`;
      const delayed = await defaultQueue.getDelayed();
      await Promise.all(
        delayed
          .filter((candidate) => candidate.id?.startsWith(prefix))
          .map((candidate) => candidate.remove().catch(() => undefined)),
      );
    }
  }
}

// --- mail -----------------------------------------------------------------

export interface SendMailPayload {
  mailer: string;
  args: Record<string, unknown>;
}

/** ActionMailer's `deliver_later`. */
export async function enqueueMail(mailer: string, args: Record<string, unknown>): Promise<void> {
  await mailersQueue.add(JOBS.sendMail, { mailer, args } satisfies SendMailPayload);
}

// --- cron -----------------------------------------------------------------

/** config/schedule.yml, expressed as BullMQ repeatable jobs (Asia/Tokyo). */
export const CRON_SCHEDULE: Array<{ name: JobName; pattern: string }> = [
  { name: JOBS.reapInactivePatrons, pattern: '30 8 * * *' },
  { name: JOBS.collectPostRewards, pattern: '0 0 * * *' },
  { name: JOBS.handleInactiveNewCustomers, pattern: '0 0 * * *' },
];

export async function registerCronJobs(): Promise<void> {
  for (const entry of CRON_SCHEDULE) {
    await cronQueue.add(
      entry.name,
      {},
      { repeat: { pattern: entry.pattern, tz: 'Asia/Tokyo' } },
    );
  }
  logger.info({ jobs: CRON_SCHEDULE.map((entry) => entry.name) }, 'cron jobs registered');
}

export async function closeQueues(): Promise<void> {
  await Promise.all([defaultQueue.close(), mailersQueue.close(), cronQueue.close()]);
  await connection.quit();
}
