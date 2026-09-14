import { Worker, type Job } from 'bullmq';
import { env } from '@/server/config/env';
import { logger } from '@/server/lib/logger';
import { prisma } from '@/server/lib/prisma';
import { closeBus } from '@/server/realtime/bus';
import { deliverQueuedMail } from '@/server/mail/mailer';
import {
  connection,
  JOBS,
  QUEUE_CRON,
  QUEUE_DEFAULT,
  QUEUE_MAILERS,
  registerCronJobs,
  type SendMailPayload,
} from '@/server/jobs/queues';
import {
  autoOpenMeetingWorker,
  collectPostRewardsWorker,
  completeMeetingWorker,
  finishMeetingWorker,
  handleInactiveNewCustomersWorker,
  informReadWorker,
  meetingBroadcastWorker,
  messageBroadcastWorker,
  openReviewModalWorker,
  reapInactivePatronsWorker,
  remindMeetingArrivalWorker,
  remindMeetingEndWorker,
  remindMeetingStartWorker,
  remindSelectionEndWorker,
} from '@/server/jobs/handlers';

/**
 * The worker process, replacing `bundle exec sidekiq`.
 *
 * Three workers, one per queue, mirroring config/sidekiq.yml's
 * `:queues: [default, mailers, cron]` and its 5/25 concurrency.
 */

const concurrency = env.isProduction ? 25 : 5;

async function handleDefault(job: Job): Promise<void> {
  switch (job.name) {
    case JOBS.messageBroadcast:
      return messageBroadcastWorker(job.data);
    case JOBS.informRead:
      return informReadWorker(job.data);
    case JOBS.meetingBroadcast:
      return meetingBroadcastWorker(job.data);
    case JOBS.autoOpenMeeting:
      return autoOpenMeetingWorker(job.data);
    case JOBS.remindSelectionEnd:
      return remindSelectionEndWorker(job.data);
    case JOBS.remindMeetingStart:
      return remindMeetingStartWorker(job.data);
    case JOBS.remindMeetingArrival:
      return remindMeetingArrivalWorker(job.data);
    case JOBS.remindMeetingEnd:
      return remindMeetingEndWorker(job.data);
    case JOBS.openReviewModal:
      return openReviewModalWorker(job.data);
    case JOBS.completeMeeting:
      return completeMeetingWorker(job.data);
    case JOBS.finishMeeting:
      return finishMeetingWorker(job.data);
    default:
      logger.warn({ job: job.name }, 'unknown job on the default queue');
  }
}

async function handleCron(job: Job): Promise<void> {
  switch (job.name) {
    case JOBS.collectPostRewards:
      return collectPostRewardsWorker();
    case JOBS.handleInactiveNewCustomers:
      return handleInactiveNewCustomersWorker();
    case JOBS.reapInactivePatrons:
      return reapInactivePatronsWorker();
    default:
      logger.warn({ job: job.name }, 'unknown job on the cron queue');
  }
}

async function main(): Promise<void> {
  const workers = [
    new Worker(QUEUE_DEFAULT, handleDefault, { connection, concurrency }),
    new Worker(
      QUEUE_MAILERS,
      async (job: Job<SendMailPayload>) => deliverQueuedMail(job.data.mailer, job.data.args),
      { connection, concurrency: 5 },
    ),
    new Worker(QUEUE_CRON, handleCron, { connection, concurrency: 1 }),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      logger.error({ job: job?.name, id: job?.id, error }, 'job failed');
    });
    worker.on('completed', (job) => {
      logger.debug({ job: job.name, id: job.id }, 'job completed');
    });
  }

  await registerCronJobs();
  logger.info({ concurrency }, 'coco workers started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down workers');
    await Promise.all(workers.map((worker) => worker.close()));
    await closeBus();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ error }, 'failed to start workers');
  process.exit(1);
});
