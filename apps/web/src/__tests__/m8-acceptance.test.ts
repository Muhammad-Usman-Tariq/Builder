import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { eq } from "drizzle-orm";
import { validateSiteDocument } from "@builder/document";
import { renderPageToStaticMarkup } from "@builder/renderer/server";
import { appRouter } from "../server/routers/_app";

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
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping M8 acceptance tests.");
}

describe.skipIf(!isDbConfigured)(
  "Milestone M8 Acceptance Test: Templates Catalog, Certification, and Site Instantiation",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let unauthorizedUserId: string;
    let caller: ReturnType<typeof appRouter.createCaller>;
    let unauthorizedCaller: ReturnType<typeof appRouter.createCaller>;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m8_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m8_${Math.random().toString(36).substring(2, 8)}`;
      unauthorizedUserId = `usr_m8_unauth_${Math.random().toString(36).substring(2, 8)}`;

      // 1. Create main test user and workspace
      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "M8 Template Tester",
        email: `tester_m8_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "M8 Template Workspace",
        slug: `m8-ws-${Date.now()}`,
        ownerId: testUserId,
        plan: "free",
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wsm_m8_${Date.now()}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      // 2. Create unauthorized user (not a member of testWsId)
      await dbClient.db.insert(schema.users).values({
        id: unauthorizedUserId,
        name: "M8 Hacker",
        email: `hacker_m8_${Date.now()}@example.com`,
      });

      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        user: { id: testUserId, name: "M8 Template Tester", email: `tester_m8_${Date.now()}@example.com` } as any,
        session: { id: "sess_m8_test", userId: testUserId, expiresAt: new Date(Date.now() + 86400000) } as any,
      });

      unauthorizedCaller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        user: { id: unauthorizedUserId, name: "M8 Hacker", email: `hacker_m8_${Date.now()}@example.com` } as any,
        session: { id: "sess_m8_unauth", userId: unauthorizedUserId, expiresAt: new Date(Date.now() + 86400000) } as any,
      });
    });

    afterAll(async () => {
      await closeAllDbConnections();
    });

    it("completes full M8 templates lifecycle: list catalog -> filter -> get preview -> instantiate site with new IDs -> render static markup -> permission checks", async () => {
      // 1. List all templates
      const catalog = await caller.templates.list();
      expect(catalog.length).toBe(5);

      const slugs = catalog.map((t) => t.slug);
      expect(slugs).toContain("saas-landing");
      expect(slugs).toContain("agency-portfolio");
      expect(slugs).toContain("restaurant-cafe");
      expect(slugs).toContain("ecommerce-showcase");
      expect(slugs).toContain("creator-blog");

      // Verify template metadata structure
      const saasMeta = catalog.find((t) => t.slug === "saas-landing")!;
      expect(saasMeta.name).toBe("Apex SaaS");
      expect(saasMeta.category).toBe("SaaS");
      expect(saasMeta.pageCount).toBe(2);
      expect(saasMeta.tags.length).toBeGreaterThan(0);
      expect(saasMeta.preview).toBeTruthy();

      // 2. Category filtering
      const agencyList = await caller.templates.list({ category: "Agency" });
      expect(agencyList.length).toBe(1);
      expect(agencyList[0]!.slug).toBe("agency-portfolio");

      // 3. Get full template definition with document
      const fullTemplate = await caller.templates.get({ slugOrId: "saas-landing" });
      expect(fullTemplate.name).toBe("Apex SaaS");
      expect(fullTemplate.document).toBeDefined();
      expect(Object.keys(fullTemplate.document.pages).length).toBe(2);

      const templateOriginalElementIds = new Set(Object.keys(fullTemplate.document.elements));

      // 4. Instantiate site from template
      const creationResult = await caller.templates.createSiteFromTemplate({
        workspaceId: testWsId,
        templateSlugOrId: "saas-landing",
        name: "My Apex SaaS Startup",
        brandTokens: {
          colors: {
            "color.primary": "#10b981",
          },
        },
      });

      expect(creationResult.siteId).toBeDefined();
      expect(creationResult.site).toBeDefined();
      expect(creationResult.site!.name).toBe("My Apex SaaS Startup");
      expect(creationResult.site!.workspaceId).toBe(testWsId);

      // 5. Verify database records
      // 5a. Site record
      const [savedSite] = await dbClient.db
        .select()
        .from(schema.sites)
        .where(eq(schema.sites.id, creationResult.siteId));
      expect(savedSite).toBeDefined();
      expect(savedSite?.name).toBe("My Apex SaaS Startup");

      // 5b. Document record
      const [savedDocRow] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, creationResult.siteId));
      expect(savedDocRow).toBeDefined();

      const doc = savedDocRow!.snapshot;
      expect(doc.site.name).toBe("My Apex SaaS Startup");
      expect(doc.tokens.colors["color.primary"]).toBe("#10b981");

      // 5c. Versions record
      const versions = await dbClient.db
        .select()
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.siteId, creationResult.siteId));
      expect(versions.length).toBe(1);
      expect(versions[0]!.reason).toBe("template");

      // 6. Non-negotiable requirement: Fresh unique IDs with zero overlap
      const newElementIds = Object.keys(doc.elements);
      expect(newElementIds.length).toBe(templateOriginalElementIds.size);
      for (const newId of newElementIds) {
        expect(templateOriginalElementIds.has(newId)).toBe(false);
      }

      // 7. Every element must have origin === "template"
      for (const el of Object.values(doc.elements)) {
        expect(el.origin).toBe("template");
      }

      // 8. Document validation
      const validation = validateSiteDocument(doc);
      expect(validation.valid).toBe(true);

      // 9. Static markup compiles cleanly for all pages
      for (const [pageId] of Object.entries(doc.pages)) {
        const { html, css } = renderPageToStaticMarkup(doc, pageId);
        expect(html).toBeTruthy();
        expect(html).toContain("Apex Cloud");
        expect(css).toBeTruthy();
      }

      // 10. Security & Tenant Isolation: Unauthorized user cannot create site in another workspace
      await expect(
        unauthorizedCaller.templates.createSiteFromTemplate({
          workspaceId: testWsId,
          templateSlugOrId: "saas-landing",
          name: "Hacked Site",
        })
      ).rejects.toThrow();
    });
  }
);
