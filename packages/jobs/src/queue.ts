import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { db, schema } from "@builder/db";
import { getQueueName, type JobType } from "./types.js";
import { getSharedRedis, createRedisConnection } from "./connection.js";
import { reportJobProgress } from "./events.js";

let jobsQueue: Queue | null = null;

/**
 * Returns the singleton BullMQ Queue instance, tuned for Redis / Upstash rate limits.
 * Architecture Section 9.3 and Non-negotiable Rule 9.
 */
export function getJobsQueue(customRedisUrl?: string): Queue {
  if (!jobsQueue) {
    const connection = customRedisUrl
      ? createRedisConnection(customRedisUrl)
      : getSharedRedis();

    jobsQueue = new Queue(getQueueName(), {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });

    jobsQueue.on("error", (err: any) => {
      const msg = err?.message || String(err);
      if (msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) {
        console.warn("[BullMQ:Queue] Redis connection lost, reconnecting…");
      } else {
        console.warn(`[BullMQ:Queue] Connection warning: ${msg}`);
      }
    });
  }
  return jobsQueue;
}

export interface EnqueueJobParams {
  jobId?: string | undefined;
  workspaceId: string;
  type: JobType;
  input?: Record<string, unknown> | undefined;
}

/**
 * Enqueues a job into BullMQ and inserts its record in PostgreSQL.
 */
export async function enqueueJob(params: EnqueueJobParams) {
  const jobId =
    params.jobId ?? `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const queue = getJobsQueue();

  // 1. Insert record into PostgreSQL jobs table
  const [record] = await db
    .insert(schema.jobs)
    .values({
      id: jobId,
      workspaceId: params.workspaceId,
      type: params.type,
      status: "queued",
      progress: 0,
      input: params.input ?? {},
    })
    .returning();

  if (!record) {
    throw new Error(`Failed to create job record for ${jobId}`);
  }

  // 2. Add to BullMQ queue (attempts: 1 for publish and AI jobs, transient retries handled internally)
  const isPublishOrAi = params.type.startsWith("publish:") || params.type.startsWith("ai:");
  const attempts = isPublishOrAi ? 1 : 3;

  const bullJob = await queue.add(
    params.type,
    {
      jobId,
      workspaceId: params.workspaceId,
      type: params.type,
      input: params.input ?? {},
    },
    {
      jobId,
      attempts,
    }
  );

  return {
    job: record,
    bullJob,
  };
}

/**
 * Cancels a job by updating PostgreSQL status and reporting a cancelled event.
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = getJobsQueue();
  const redis = getSharedRedis();

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (!job) return false;
  if (job.status === "succeeded" || job.status === "failed") return false;

  // 1. Try removing from BullMQ
  try {
    const bullJob = await queue.getJob(jobId);
    if (bullJob) {
      await bullJob.remove();
    }
  } catch {
    // Ignore error if job is already being processed
  }

  // 2. Release reserved usage units if this was an AI job
  if (job.type.startsWith("ai:")) {
    const input = job.input as Record<string, unknown> | null;
    const reservedUnits =
      typeof input?.["reservedUnits"] === "number"
        ? (input["reservedUnits"] as number)
        : job.type === "ai:generate-site"
        ? 10
        : 2;
    try {
      const { releaseUsage } = await import("@builder/db");
      await releaseUsage(db, {
        workspaceId: job.workspaceId,
        metric: "ai_units",
        units: reservedUnits,
      });
    } catch (uErr) {
      console.warn("[cancelJob] Failed to release usage units:", uErr);
    }
  }

  // 3. Update status and publish event
  await reportJobProgress(redis, {
    jobId,
    status: "cancelled",
    progress: job.progress,
    message: "Job cancelled by user",
  });

  return true;
}

/**
 * Retries a failed or cancelled job.
 */
export async function retryJob(jobId: string): Promise<boolean> {
  const queue = getJobsQueue();
  const redis = getSharedRedis();

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (!job) return false;

  // 1. Reset PostgreSQL record
  await reportJobProgress(redis, {
    jobId,
    status: "queued",
    progress: 0,
    message: "Job queued for retry",
  });

  // 2. Re-add to BullMQ
  await queue.add(
    job.type,
    {
      jobId: job.id,
      workspaceId: job.workspaceId,
      type: job.type as JobType,
      input: (job.input as Record<string, unknown>) ?? {},
    },
    {
      jobId: `${job.id}-retry-${Date.now()}`,
    }
  );

  return true;
}

/**
 * Closes BullMQ queue connection (for test teardown and graceful shutdown).
 */
export async function closeJobsQueue(): Promise<void> {
  if (jobsQueue) {
    await jobsQueue.close();
    jobsQueue = null;
  }
}

/**
 * Purges and drains stale jobs from the queue (for test environments).
 */
export async function purgeJobsQueue(customRedisUrl?: string): Promise<void> {
  const queue = getJobsQueue(customRedisUrl);
  try {
    await queue.drain(true);
    await queue.clean(0, 1000, "failed");
    await queue.clean(0, 1000, "completed");
    await queue.clean(0, 1000, "delayed");
    await queue.clean(0, 1000, "wait");
  } catch (err) {
    console.warn("[BullMQ:Queue] purgeJobsQueue warning:", err);
  }
}
