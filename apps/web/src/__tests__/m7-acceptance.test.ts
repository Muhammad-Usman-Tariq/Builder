import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { isAiConfigured } from "@builder/ai";
import { eq } from "drizzle-orm";
import { appRouter } from "../server/routers/_app";
import { createWorker } from "@builder/jobs/worker";

// Auto-load .env for local testing
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

import { isConfiguredDatabaseUrl } from "./test-helpers.js";

const testDbUrl = process.env["DATABASE_URL_TEST"];
const isDbConfigured = isConfiguredDatabaseUrl(testDbUrl);
if (!isDbConfigured) {
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping M7 acceptance tests.");
}

describe.skipIf(!isDbConfigured)(
  "Milestone M7 Acceptance Test: AI Site Generation Pipeline, Quota, and Text Rewrite",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let caller: ReturnType<typeof appRouter.createCaller>;
    let testWorker: ReturnType<typeof createWorker> | null = null;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m7_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m7_${Math.random().toString(36).substring(2, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "M7 Tester",
        email: `tester_m7_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "M7 Test Workspace",
        slug: `m7-ws-${Date.now()}`,
        ownerId: testUserId,
        plan: "free",
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wsm_m7_${Date.now()}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        user: { id: testUserId, name: "M7 Tester", email: `tester_m7_${Date.now()}@example.com` } as any,
        session: { id: "sess_m7_test", userId: testUserId, expiresAt: new Date(Date.now() + 86400000) } as any,
      });

      // Start worker to process background jobs
      testWorker = createWorker();
    });

    afterAll(async () => {
      if (testWorker) {
        await testWorker.close();
      }
      await closeAllDbConnections();
    }, 30000);

    it("completes full M7 AI lifecycle: quota inspection -> text rewrite -> generate site job -> DB snapshot", async (ctx) => {
      if (!isAiConfigured() || process.env.RUN_LIVE_AI_TESTS !== "true") {
        ctx.skip();
        console.log("SKIPPED: needs AI_MODEL_CHAIN, provider API keys in .env, and RUN_LIVE_AI_TESTS=true");
        return;
      }

      // 1. Check initial quota
      const initialQuota = await caller.ai.getQuota({ workspaceId: testWsId });
      expect(initialQuota.limit).toBe(100);
      expect(initialQuota.used).toBe(0);

      // 2. Test text rewrite endpoint
      const rewriteResult = await caller.ai.rewriteText({
        workspaceId: testWsId,
        text: "We sell good coffee and delicious snacks.",
        instruction: "Make it punchy & concise",
      });

      expect(rewriteResult.text).toBeDefined();
      expect(rewriteResult.text.length).toBeGreaterThan(0);

      // Verify usage counter was incremented by 1
      const updatedQuota = await caller.ai.getQuota({ workspaceId: testWsId });
      expect(updatedQuota.used).toBe(1);

      // 3. Create a site to hold AI generation
      const site = await caller.sites.create({
        workspaceId: testWsId,
        name: "M7 AI Coffee Roastery",
      });

      if (!site?.id) throw new Error("Failed to create site");
      const siteId = site.id;

      // 4. Enqueue AI site generation
      const generateRes = await caller.ai.generateSite({
        workspaceId: testWsId,
        siteId,
        prompt: "Specialty coffee roastery in Lahore with single origin beans, seasonal pastries, and online ordering",
      });

      expect(generateRes.success).toBe(true);
      expect(generateRes.jobId).toBeDefined();

      // Wait for BullMQ worker to pick up and process job
      let jobRecord;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const [found] = await dbClient.db
          .select()
          .from(schema.jobs)
          .where(eq(schema.jobs.id, generateRes.jobId));

        if (found && (found.status === "succeeded" || found.status === "failed")) {
          jobRecord = found;
          break;
        }
      }

      expect(jobRecord).toBeDefined();
      expect(jobRecord?.status).toBe("succeeded");

      // 5. Verify Site Document was compiled and saved to PostgreSQL
      const [savedDocRow] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, siteId));

      expect(savedDocRow).toBeDefined();
      const doc = savedDocRow?.snapshot as any;
      expect(doc.pages).toBeDefined();
      expect(Object.keys(doc.pages).length).toBeGreaterThanOrEqual(2); // Multi-page plan
      expect(Object.keys(doc.elements).length).toBeGreaterThan(5); // Rich element tree
      expect(doc.tokens.fonts.heading).toBeDefined();

      // 6. Verify version snapshot was recorded in site_versions
      const versions = await dbClient.db
        .select()
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.siteId, siteId));

      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0]?.reason).toContain("AI generation");
    }, 180000);
  }
);
