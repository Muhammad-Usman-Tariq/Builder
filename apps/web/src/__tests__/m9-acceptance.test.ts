import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { eq } from "drizzle-orm";
import { createBlankDocument } from "@builder/document";
import { decryptSecret } from "@builder/publish";
import { buildStaticSite } from "@builder/publish/builder";
import { appRouter } from "../server/routers/_app";
import { POST as handleFormPost } from "../app/api/public/forms/[siteId]/[formId]/route";

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

const testDbUrl = process.env["DATABASE_URL_TEST"];

describe.skipIf(!testDbUrl)(
  "Milestone M9 Acceptance Test: Publishing, Vercel Deployments, Rollback, and Form Submissions",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let testSiteId: string;
    let caller: ReturnType<typeof appRouter.createCaller>;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m9_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m9_${Math.random().toString(36).substring(2, 8)}`;
      testSiteId = `site_m9_${Math.random().toString(36).substring(2, 8)}`;

      // 1. Create main test user and workspace
      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "M9 Publish Tester",
        email: `tester_m9_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "M9 Publish Workspace",
        slug: `m9-ws-${Date.now()}`,
        ownerId: testUserId,
        plan: "pro",
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wm_m9_${Math.random().toString(36).substring(2, 8)}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      // 2. Create test site and document
      const blankDoc = createBlankDocument("Home");
      await dbClient.db.insert(schema.sites).values({
        id: testSiteId,
        workspaceId: testWsId,
        name: "M9 Test Site",
        slug: "m9-test-site",
      });

      await dbClient.db.insert(schema.siteDocuments).values({
        siteId: testSiteId,
        snapshot: blankDoc,
        schemaVersion: 1,
      });

      // 3. Create tRPC caller
      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        session: {
          id: `sess_m9_${Math.random().toString(36).substring(2, 8)}`,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          token: "tok_m9",
        } as any,
        user: {
          id: testUserId,
          name: "M9 Publish Tester",
          email: `tester_m9_${Date.now()}@example.com`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      });
    });

    afterAll(async () => {
      if (dbClient) {
        await closeAllDbConnections();
      }
    });

    it("Preflight checks fail when Vercel is not connected, pass when connected", async () => {
      // 1. Initially Vercel is not connected
      const preflight1 = await caller.publish.preflight({ siteId: testSiteId });
      expect(preflight1.passed).toBe(false);
      expect(preflight1.errors.some((e) => e.code === "PUB_NO_VERCEL_CONNECTION")).toBe(true);

      // 2. Connect Vercel using encrypted secret
      const sampleToken = "vercel_tok_sample_test_1234567890";
      const connectRes = await caller.publish.connect({
        workspaceId: testWsId,
        token: sampleToken,
        skipVerification: true,
      });
      expect(connectRes.success).toBe(true);

      // Verify token is encrypted in DB
      const [integration] = await dbClient.db
        .select()
        .from(schema.integrations)
        .where(eq(schema.integrations.workspaceId, testWsId));

      expect(integration).toBeDefined();
      expect(integration!.encryptedTokens).not.toBe(sampleToken);
      expect(decryptSecret(integration!.encryptedTokens)).toBe(sampleToken);

      // 3. Run preflight again -> now passes Vercel connection check
      const preflight2 = await caller.publish.preflight({ siteId: testSiteId });
      expect(preflight2.passed).toBe(true);
      expect(preflight2.errors.length).toBe(0);
    });

    it("Static distribution compiles all required assets, HTML, forms script, and security headers", async () => {
      const [docRecord] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      const build = buildStaticSite(docRecord!.snapshot as any, {
        siteId: testSiteId,
        domainUrl: "https://my-test-site.vercel.app",
        apiPublicUrl: "http://localhost:3000",
      });

      expect(build.files["index.html"]).toBeDefined();
      expect(build.files["index.html"]).toContain("<!DOCTYPE html>");
      expect(build.files["assets/site.css"]).toBeDefined();
      expect(build.files["assets/forms.js"]).toBeDefined();
      expect(build.files["sitemap.xml"]).toBeDefined();
      expect(build.files["robots.txt"]).toBeDefined();
      expect(build.files["vercel.json"]).toBeDefined();

      const vercelConfig = JSON.parse(build.files["vercel.json"]!);
      expect(vercelConfig.cleanUrls).toBe(true);
      expect(vercelConfig.headers).toBeDefined();
      const headers = vercelConfig.headers[0].headers;
      expect(headers.some((h: any) => h.key === "Content-Security-Policy")).toBe(true);
      expect(headers.some((h: any) => h.key === "X-Frame-Options")).toBe(true);
    });

    it("Publish mutation successfully enqueues BullMQ worker job", async () => {
      const pubRes = await caller.publish.publish({ siteId: testSiteId });
      expect(pubRes.jobId).toBeDefined();

      const [dbJob] = await dbClient.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.id, pubRes.jobId));

      expect(dbJob).toBeDefined();
      expect(dbJob!.type).toBe("publish:build-deploy");
      expect(dbJob!.workspaceId).toBe(testWsId);
    });

    it("Form submissions API saves valid submissions and flags honeypot spam", async () => {
      // 1. Submit normal form submission
      const normalReq = new Request("http://localhost:3000/api/public/forms/fake/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Jane Visitor",
          email: "jane@example.com",
          message: "Interested in your service!",
        }),
      });

      const normalRes = await handleFormPost(normalReq, {
        params: Promise.resolve({ siteId: testSiteId, formId: "contact-form" }),
      });
      const normalData = await normalRes.json();
      expect(normalRes.status).toBe(200);
      expect(normalData.ok).toBe(true);
      expect(normalData.submissionId).toBeDefined();

      // 2. Submit bot submission with honeypot field
      const botReq = new Request("http://localhost:3000/api/public/forms/fake/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Spam Bot",
          _gotcha: "spam content",
          message: "Buy cheap crypto",
        }),
      });

      const botRes = await handleFormPost(botReq, {
        params: Promise.resolve({ siteId: testSiteId, formId: "contact-form" }),
      });
      const botData = await botRes.json();
      expect(botRes.status).toBe(200);
      expect(botData.ok).toBe(true);

      // 3. Query submissions via tRPC
      const submissions = await caller.forms.listSubmissions({ siteId: testSiteId });
      expect(submissions.length).toBe(2);

      const botSub = submissions.find((s) => s.id === botData.submissionId);
      const normalSub = submissions.find((s) => s.id === normalData.submissionId);

      expect(botSub?.spamScore).toBe(100);
      expect(normalSub?.spamScore).toBe(0);
    });

    it("Rollback restores previous site document version", async () => {
      // 1. Create a version snapshot
      const [initialDoc] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      const oldVersionId = randomUUID();
      await dbClient.db.insert(schema.siteVersions).values({
        id: oldVersionId,
        siteId: testSiteId,
        snapshot: initialDoc!.snapshot,
        reason: "publish",
        createdBy: testUserId,
      });

      const deploymentId = randomUUID();
      await dbClient.db.insert(schema.deployments).values({
        id: deploymentId,
        siteId: testSiteId,
        versionId: oldVersionId,
        provider: "vercel",
        status: "ready",
        url: "https://m9-test-deployment.vercel.app",
      });

      // 2. Mutate active document
      const modifiedDoc = JSON.parse(JSON.stringify(initialDoc!.snapshot));
      const firstElemId = Object.keys(modifiedDoc.elements)[0]!;
      modifiedDoc.elements[firstElemId].name = "Modified Root Name";
      await dbClient.db
        .update(schema.siteDocuments)
        .set({ snapshot: modifiedDoc })
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      // 3. Perform rollback via tRPC -> redeploys older version without touching draft
      const rollbackRes = await caller.publish.rollback({
        siteId: testSiteId,
        deploymentId,
      });

      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.redeployedVersionId).toBe(oldVersionId);

      // 4. Verify current draft in DB has NOT been overwritten
      const [draftDoc] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      expect((draftDoc!.snapshot as any).elements[firstElemId]?.name).toBe("Modified Root Name");

      // 5. Explicitly restore version into the editor
      const restoreRes = await caller.publish.restoreVersion({
        siteId: testSiteId,
        versionId: oldVersionId,
      });

      expect(restoreRes.success).toBe(true);
      expect(restoreRes.restoredVersionId).toBe(oldVersionId);

      // 6. Verify draft is now restored and pre-restore draft was preserved as a version
      const [restoredDoc] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      expect((restoredDoc!.snapshot as any).elements[firstElemId]?.name).not.toBe("Modified Root Name");
    });
  }
);
