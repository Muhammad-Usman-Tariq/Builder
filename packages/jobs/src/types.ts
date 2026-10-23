import { z } from "zod";

export function getQueueName(): string {
  const prefix = process.env.QUEUE_PREFIX?.trim();
  return prefix ? `${prefix}-builder-jobs` : "builder-jobs";
}

export const BUILDER_QUEUE_NAME = getQueueName();

export const JobTypeSchema = z.enum([
  "dummy-slow",
  "ai:generate-site",
  "ai:regenerate-section",
  "ai:rewrite-text",
  "publish:build-deploy",
  "media:process-image",
  "import:url",
  "import:figma",
]);

export type JobType = z.infer<typeof JobTypeSchema>;

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobProgressEvent {
  jobId: string;
  status: JobStatus;
  progress: number; // 0..100
  message?: string | undefined;
  output?: unknown | undefined;
  error?: string | undefined;
  timestamp: number;
}

export function getJobProgressChannel(jobId: string): string {
  return `job:progress:${jobId}`;
}

export interface DummySlowJobPayload {
  steps?: number | undefined;
  stepDelayMs?: number | undefined;
}
