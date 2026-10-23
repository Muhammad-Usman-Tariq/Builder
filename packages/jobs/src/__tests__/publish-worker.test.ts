import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { createBlankDocument } from "@builder/document";
import { encryptSecret } from "@builder/publish";
import {
  enqueueJob,
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

import { isConfiguredDatabaseUrl, isConfiguredRedisUrl } from "./test-helpers.js";

const testDbUrl = process.env["DATABASE_URL_TEST"];
const redisUrl = process.env["REDIS_URL"];
const isConfigured = isConfiguredDatabaseUrl(testDbUrl) && isConfiguredRedisUrl(redisUrl);
if (!isConfigured) {
  console.info("SKIP: DATABASE_URL_TEST or REDIS_URL is not configured or is a placeholder. Skipping publish-worker tests.");
}

describe.skipIf(!isConfigured)(
  "Integration: Full Publish Job via Worker Handler (Section A.4)",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let worker: ReturnType<typeof createWorker>;
    let subscriber: ReturnType<typeof createRedisConnection>;
    let testWsId: string;
    let testSiteId: string;
    let testUserId: string;

    const recordedProjectId = "prj_rec_xyz789";
    const recordedDeploymentId = "dpl_rec_abc123";
    const recordedDeployUrl = "my-artisan-bistro-live.vercel.app";

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_pub_${randomUUID().slice(0, 8)}`;
      testWsId = `ws_pub_${randomUUID().slice(0, 8)}`;
      testSiteId = `site_pub_${randomUUID().slice(0, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "Publish Tester",
        email: `pubtester_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "Publish Test Workspace",
        slug: `pub-ws-${Date.now()}`,
        ownerId: testUserId,
      });

      // Insert Vercel integration with encrypted fake token
      const encKey = process.env.ENCRYPTION_KEY || "0".repeat(64);
      const encryptedToken = encryptSecret("vercel_test_token_live_xyz", encKey);

      await dbClient.db.insert(schema.integrations).values({
        id: `int_${randomUUID().slice(0, 8)}`,
        workspaceId: testWsId,
        provider: "vercel",
        encryptedTokens: encryptedToken,
        status: "active",
      });

      // Insert Site
      await dbClient.db.insert(schema.sites).values({
        id: testSiteId,
        workspaceId: testWsId,
        name: "Artisan Bistro",
        slug: "artisan-bistro",
      });

      // Insert valid Site Document
      const blankDoc = createBlankDocument("Artisan Bistro");
      await dbClient.db.insert(schema.siteDocuments).values({
        siteId: testSiteId,
        snapshot: blankDoc,
        schemaVersion: 1,
      });

      subscriber = createRedisConnection(redisUrl);
      worker = createWorker(redisUrl);
    });

    afterAll(async () => {
      if (worker) await worker.close(true);
      await closeJobsQueue();
      if (subscriber) {
        try {
          await subscriber.quit();
        } catch {
          subscriber.disconnect();
        }
      }
      await closeAllDbConnections();
    }, 20000);

    it("runs full publish job: build -> create project -> deploy -> poll status -> save to DB", async () => {
      let projectCreated = false;
      let deploymentCreated = false;
      let statusPolled = false;

      // Mock fetch with recorded Vercel API responses
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input: any, init?: any) => {
        const urlStr = typeof input === "string" ? input : input.toString();

        // 1. Projects endpoint: GET /v9/projects/:name
        if (urlStr.includes("/v9/projects/") && (!init || init.method === "GET" || !init.method)) {
          if (!projectCreated) {
            return new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 });
          }
          return new Response(
            JSON.stringify({ id: recordedProjectId, name: "artisan-bistro-site" }),
            { status: 200 }
          );
        }

        // 2. Projects endpoint: POST /v9/projects
        if (urlStr.includes("/v9/projects") && init?.method === "POST") {
          projectCreated = true;
          return new Response(
            JSON.stringify({ id: recordedProjectId, name: "artisan-bistro-site" }),
            { status: 200 }
          );
        }

        // 3. Deployments endpoint: POST /v13/deployments
        if (urlStr.includes("/v13/deployments") && init?.method === "POST") {
          deploymentCreated = true;
          return new Response(
            JSON.stringify({
              id: recordedDeploymentId,
              projectId: recordedProjectId,
              readyState: "BUILDING",
              url: recordedDeployUrl,
              inspectorUrl: "https://vercel.com/inspect",
            }),
            { status: 200 }
          );
        }

        // 4. Polling endpoint: GET /v13/deployments/:id
        if (urlStr.includes(`/v13/deployments/${recordedDeploymentId}`)) {
          statusPolled = true;
          return new Response(
            JSON.stringify({
              id: recordedDeploymentId,
              readyState: "READY",
              url: recordedDeployUrl,
            }),
            { status: 200 }
          );
        }

        return originalFetch(input, init);
      });

      try {
        const testJobId = `job_pub_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        const channel = getJobProgressChannel(testJobId);
        const receivedEvents: JobProgressEvent[] = [];

        await subscriber.subscribe(channel);
        const messageHandler = (ch: string, msg: string) => {
          if (ch === channel) {
            receivedEvents.push(JSON.parse(msg));
          }
        };
        subscriber.on("message", messageHandler);

        // Enqueue publish job
        await enqueueJob({
          jobId: testJobId,
          workspaceId: testWsId,
          type: "publish:build-deploy",
          input: {
            siteId: testSiteId,
            userId: testUserId,
          },
        });

        // Wait for job completion in Redis events or DB status
        const startTime = Date.now();
        while (Date.now() - startTime < 15000) {
          const hasSucceeded = receivedEvents.some((e) => e.status === "succeeded");
          if (hasSucceeded) break;
          await new Promise((r) => setTimeout(r, 200));
        }

        subscriber.off("message", messageHandler);

        // Verify Vercel interactions occurred
        expect(projectCreated).toBe(true);
        expect(deploymentCreated).toBe(true);
        expect(statusPolled).toBe(true);

        // Verify Redis events include progress up to 100% and success
        expect(receivedEvents.some((e) => e.status === "running")).toBe(true);
        const successEvent = receivedEvents.find((e) => e.status === "succeeded");
        expect(successEvent).toBeDefined();
        expect(successEvent?.progress).toBe(100);
        expect((successEvent?.output as any)?.url).toBe("https://artisan-bistro-site.vercel.app");
        expect((successEvent?.output as any)?.deploymentUrl).toBe(`https://${recordedDeployUrl}`);

        // Verify DB was updated
        const [updatedSite] = await dbClient.db
          .select()
          .from(schema.sites)
          .where(eq(schema.sites.id, testSiteId));

        expect(updatedSite?.vercelProjectId).toBe(recordedProjectId);
        expect(updatedSite?.vercelProjectName).toBeDefined();
        expect(updatedSite?.vercelProjectName).toMatch(/artisan-bistro/);

        // Verify deployment record in DB
        const [depRecord] = await dbClient.db
          .select()
          .from(schema.deployments)
          .where(eq(schema.deployments.siteId, testSiteId));

        expect(depRecord).toBeDefined();
        expect(depRecord?.status).toBe("ready");
        expect(depRecord?.url).toBe("https://artisan-bistro-site.vercel.app");
        expect(depRecord?.logs).toContain(recordedDeployUrl);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }, 30000);
  }
);
