import type { Redis } from "ioredis";
import { eq, and, ne } from "drizzle-orm";
import { db, schema } from "@builder/db";
import { type JobProgressEvent, getJobProgressChannel } from "./types.js";

/**
 * Publishes progress to Redis pub/sub channel AND syncs state to PostgreSQL jobs table.
 */
export async function reportJobProgress(
  redis: Redis,
  event: Omit<JobProgressEvent, "timestamp">
): Promise<void> {
  const fullEvent: JobProgressEvent = {
    ...event,
    timestamp: Date.now(),
  };

  // 1. Sync PostgreSQL status (protect cancelled status from being overwritten)
  try {
    const mergedOutput =
      event.output !== undefined
        ? event.message
          ? { ...(typeof event.output === "object" ? event.output : {}), message: event.message }
          : event.output
        : event.message
        ? { message: event.message }
        : undefined;

    const updateQuery = db
      .update(schema.jobs)
      .set({
        status: event.status,
        progress: event.progress,
        ...(mergedOutput !== undefined ? { output: mergedOutput } : {}),
        error: event.error,
        updatedAt: new Date(),
      });

    if (event.status === "cancelled") {
      await updateQuery.where(eq(schema.jobs.id, event.jobId));
    } else {
      await updateQuery.where(
        and(
          eq(schema.jobs.id, event.jobId),
          ne(schema.jobs.status, "cancelled")
        )
      );
    }
  } catch (err) {
    console.warn(`[Jobs] Failed to sync progress for job ${event.jobId} to DB:`, err);
  }

  // 2. Publish to Redis pub/sub channel for SSE streaming
  try {
    const channel = getJobProgressChannel(event.jobId);
    await redis.publish(channel, JSON.stringify(fullEvent));
  } catch (err) {
    console.warn(`[Jobs] Failed to publish progress for job ${event.jobId} to Redis:`, err);
  }
}
