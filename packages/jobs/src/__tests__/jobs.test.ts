import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import {
  enqueueJob,
  cancelJob,
  retryJob,
  closeJobsQueue,
  createRedisConnection,
  getJobProgressChannel,
  type JobProgressEvent,
} from "../index.js";
import { createWorker } from "../worker.js";

// Auto-load root .env if running standalone
const envFile = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const testDbUrl = process.env["DATABASE_URL_TEST"];
const redisUrl = process.env["REDIS_URL"];

describe.skipIf(!testDbUrl || !redisUrl)(
  "Milestone M4: BullMQ Worker, Jobs, Redis Pub/Sub Progress",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let worker: ReturnType<typeof createWorker>;
    let subscriber: ReturnType<typeof createRedisConnection>;
    let testWsId: string;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      // Create a test workspace
      testWsId = `ws_job_test_${Math.random().toString(36).substring(2, 8)}`;
      const testUserId = `usr_job_test_${Math.random().toString(36).substring(2, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "Worker Tester",
        email: `tester_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "Jobs Test Workspace",
        slug: `jobs-test-ws-${Date.now()}`,
        ownerId: testUserId,
      });

      subscriber = createRedisConnection(redisUrl);
      worker = createWorker(redisUrl);
    });

    afterAll(async () => {
      if (worker) await worker.close();
      await closeJobsQueue();
      if (subscriber) await subscriber.quit();
      await closeAllDbConnections();
    });

    it(
      "processes dummy-slow job, reports live progress over Redis pub/sub, and updates DB",
      async () => {
      const testJobId = `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const channel = getJobProgressChannel(testJobId);
      const receivedEvents: JobProgressEvent[] = [];

      // 1. Subscribe to Redis pub/sub channel for this job BEFORE enqueuing
      await subscriber.subscribe(channel);
      const messageHandler = (ch: string, msg: string) => {
        if (ch === channel) {
          receivedEvents.push(JSON.parse(msg));
        }
      };
      subscriber.on("message", messageHandler);

      // 2. Enqueue job (5 steps with 60ms delay)
      const { job } = await enqueueJob({
        jobId: testJobId,
        workspaceId: testWsId,
        type: "dummy-slow",
        input: { steps: 5, stepDelayMs: 60 },
      });

      expect(job.id).toBe(testJobId);
      expect(job.status).toBe("queued");

      // 3. Wait for terminal event over pub/sub or timeout (up to 8 seconds)
      const startTime = Date.now();
      while (Date.now() - startTime < 8000) {
        if (receivedEvents.some((e) => e.status === "succeeded")) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      // 4. Verify progress events were received over Redis pub/sub
      expect(receivedEvents.length).toBeGreaterThan(0);
      const hasTerminal = receivedEvents.some(
        (e) => e.status === "succeeded" && e.progress === 100
      );
      expect(hasTerminal).toBe(true);

      // 5. Verify database final status
      const [finalJob] = await dbClient.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id));

      expect(finalJob?.status).toBe("succeeded");
      expect(finalJob?.progress).toBe(100);
      expect(finalJob?.output).toMatchObject({ stepsCompleted: 5 });

      subscriber.off("message", messageHandler);
      await subscriber.unsubscribe(channel);
    }, 15000);

    it("supports cancelling an active job", async () => {
      // Enqueue job with longer steps (10 steps of 200ms)
      const { job } = await enqueueJob({
        workspaceId: testWsId,
        type: "dummy-slow",
        input: { steps: 10, stepDelayMs: 200 },
      });

      // Allow worker to pick it up and enter step 1
      await new Promise((r) => setTimeout(r, 200));

      // Cancel the job
      const cancelled = await cancelJob(job.id);
      expect(cancelled).toBe(true);

      // Wait a moment for worker loop to detect cancellation
      await new Promise((r) => setTimeout(r, 500));

      const [cancelledDbJob] = await dbClient.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id));

      expect(cancelledDbJob?.status).toBe("cancelled");
    });

    it("supports retrying a job", async () => {
      const { job } = await enqueueJob({
        workspaceId: testWsId,
        type: "dummy-slow",
        input: { steps: 2, stepDelayMs: 20 },
      });

      const retried = await retryJob(job.id);
      expect(retried).toBe(true);

      const [retriedJob] = await dbClient.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, job.id));

      expect(["queued", "running", "succeeded"]).toContain(retriedJob?.status);
    });
  }
);
