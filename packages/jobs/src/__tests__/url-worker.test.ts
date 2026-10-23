import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
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

const testDbUrl = process.env["DATABASE_URL_TEST"];
const redisUrl = process.env["REDIS_URL"];

describe.skipIf(!testDbUrl || !redisUrl)(
  "Integration: URL Clone through Real Worker Runtime (Section C.3)",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let worker: ReturnType<typeof createWorker>;
    let subscriber: ReturnType<typeof createRedisConnection>;
    let testWsId: string;
    let testSiteId: string;
    let testUserId: string;
    let httpServer: http.Server;
    let serverUrl: string;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      // Start local HTTP test server
      await new Promise<void>((resolve) => {
        httpServer = http.createServer((_req, res) => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <!DOCTYPE html>
            <html lang="en">
              <head><title>Artisan Bakery</title></head>
              <body>
                <header id="hero-header">
                  <h1 id="title">Artisan Bakery & Cafe</h1>
                  <p id="desc">Handcrafted organic pastries and specialty coffee.</p>
                </header>
                <section id="menu-section">
                  <h2 id="menu-title">Seasonal Specialties</h2>
                  <button id="cta-button">Order Pickup</button>
                </section>
              </body>
            </html>
          `);
        });
        httpServer.listen(0, "127.0.0.1", () => {
          const addr = httpServer.address() as any;
          serverUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });

      testUserId = `usr_url_${randomUUID().slice(0, 8)}`;
      testWsId = `ws_url_${randomUUID().slice(0, 8)}`;
      testSiteId = `site_url_${randomUUID().slice(0, 8)}`;

      // Seed user, workspace, and target site
      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        email: `urltest_${Date.now()}@example.com`,
        name: "URL Tester",
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "URL Workspace",
        slug: `ws-url-${Date.now()}`,
        ownerId: testUserId,
      });

      await dbClient.db.insert(schema.sites).values({
        id: testSiteId,
        workspaceId: testWsId,
        name: "URL Clone Test Site",
      });

      // Start real background worker
      worker = createWorker(redisUrl);
      subscriber = createRedisConnection(redisUrl);
    });

    afterAll(async () => {
      if (httpServer) {
        await new Promise<void>((r) => httpServer.close(() => r()));
      }
      if (worker) {
        await worker.close(true);
      }
      if (subscriber) {
        try {
          await subscriber.quit();
        } catch {
          subscriber.disconnect();
        }
      }
      await closeJobsQueue();

      if (dbClient) {
        try {
          await dbClient.db.delete(schema.sites).where(eq(schema.sites.id, testSiteId));
          await dbClient.db.delete(schema.workspaces).where(eq(schema.workspaces.id, testWsId));
          await dbClient.db.delete(schema.users).where(eq(schema.users.id, testUserId));
        } catch {}
      }
      await closeAllDbConnections();
    });

    it("imports HTML structure from local HTTP page via real worker and persists document", async () => {
      // 1. Enqueue import:url job
      const { job } = await enqueueJob({
        workspaceId: testWsId,
        type: "import:url",
        input: {
          url: serverUrl,
          siteId: testSiteId,
          siteName: "Cloned Bakery",
          allowLocal: true,
        },
      });

      expect(job.id).toBeDefined();

      // 2. Track job progress via Redis pub/sub
      const channel = getJobProgressChannel(job.id);
      await subscriber.subscribe(channel);

      const jobFinishedPromise = new Promise<JobProgressEvent>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Worker job timed out after 30 seconds"));
        }, 30000);

        subscriber.on("message", (_ch, message) => {
          try {
            const ev = JSON.parse(message) as JobProgressEvent;
            if (ev.status === "succeeded" || ev.status === "failed") {
              clearTimeout(timeout);
              resolve(ev);
            }
          } catch {}
        });
      });

      const finalEvent = await jobFinishedPromise;
      expect(finalEvent.status).toBe("succeeded");

      // 3. Verify site document in database
      const [docRow] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      expect(docRow).toBeDefined();
      expect(docRow!.snapshot).toBeDefined();

      const snapshot = docRow!.snapshot as any;
      expect(snapshot.elements).toBeDefined();

      // Verify imported elements contain Heading and Button
      const elements = Object.values(snapshot.elements) as any[];
      const headings = elements.filter((el) => el.type === "Heading");
      expect(headings.length).toBeGreaterThan(0);
      expect(headings.some((h) => h.props?.text?.includes("Artisan Bakery"))).toBe(true);

      const buttons = elements.filter((el) => el.type === "Button");
      expect(buttons.length).toBeGreaterThan(0);

      // Verify site version snapshot was recorded
      const versions = await dbClient.db
        .select()
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.siteId, testSiteId));

      expect(versions.length).toBeGreaterThan(0);
    }, 35000);
  }
);
