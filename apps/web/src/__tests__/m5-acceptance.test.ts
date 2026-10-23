import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { eq } from "drizzle-orm";
import { appRouter } from "../server/routers/_app";
import {
  useEditorStore,
  getElementEffectiveStyle,
} from "@builder/editor-core";

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
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping M5 acceptance tests.");
}

describe.skipIf(!isDbConfigured)(
  "Milestone M5 Acceptance Test: Visual Editor, Canvas, Inspector, and Persistence",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let caller: ReturnType<typeof appRouter.createCaller>;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      // Create test user and workspace
      testUserId = `usr_m5_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m5_${Math.random().toString(36).substring(2, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "M5 Tester",
        email: `tester_m5_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "M5 Test Workspace",
        slug: `m5-ws-${Date.now()}`,
        ownerId: testUserId,
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wsm_m5_${Date.now()}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        user: { id: testUserId, name: "M5 Tester", email: `tester_m5_${Date.now()}@example.com` } as any,
        session: { id: "sess_m5_test", userId: testUserId, expiresAt: new Date(Date.now() + 86400000) } as any,
      });
    });

    afterAll(async () => {
      await closeAllDbConnections();
    });

    it("completes full M5 loop: create site -> edit visually -> reload and verify changes persisted in DB", async () => {
      // 1. Create a blank website
      const site = await caller.sites.create({
        workspaceId: testWsId,
        name: "M5 Showcase Site",
      });

      if (!site) throw new Error("Site creation returned undefined");
      expect(site.id).toBeDefined();

      // 2. Fetch initial document
      const initialFetch = await caller.sites.get({ siteId: site.id });
      expect(initialFetch.document).toBeDefined();

      // 3. Initialize editor store with site document
      useEditorStore.getState().init(initialFetch.document!);
      const homePageId = useEditorStore.getState().activePageId;
      const homePage = useEditorStore.getState().doc.pages[homePageId]!;

      // 4. Insert a Heading element
      const headingId = useEditorStore.getState().insertElement({
        type: "Heading",
        parentId: homePage.rootId,
        props: { text: "Welcome to Builder M5", level: 1 },
      });
      expect(headingId).toBeDefined();

      // 5. Update heading text prop
      useEditorStore.getState().setProp(headingId!, "text", "Awesome Website Title");

      // 6. Set custom styles across desktop and mobile breakpoints
      const headingEl = useEditorStore.getState().doc.elements[headingId!]!;
      const styleId = headingEl.styleIds[0]!;

      useEditorStore.getState().setStyle(
        styleId,
        {
          color: { raw: "#2563eb" },
          fontSize: { value: 36, unit: "px" },
        },
        "desktop"
      );

      useEditorStore.getState().setStyle(
        styleId,
        {
          fontSize: { value: 24, unit: "px" },
        },
        "mobile"
      );

      // Verify cascade in-memory
      const desktopStyle = getElementEffectiveStyle(
        useEditorStore.getState().doc,
        headingId!,
        "desktop"
      );
      expect(desktopStyle?.declarations["fontSize"]).toEqual({ value: 36, unit: "px" });

      const mobileStyle = getElementEffectiveStyle(
        useEditorStore.getState().doc,
        headingId!,
        "mobile"
      );
      expect(mobileStyle?.declarations["fontSize"]).toEqual({ value: 24, unit: "px" });

      // 7. Add a new page
      const aboutPageId = useEditorStore.getState().addPage({
        name: "About Us",
        slug: "/about",
        title: "About Our Story",
        description: "Company history and team",
      });
      expect(aboutPageId).toBeDefined();

      // 8. Save updated document to server via tRPC documents.save
      const editedDoc = useEditorStore.getState().doc;
      const saveResult = await caller.documents.save({
        siteId: site.id,
        document: editedDoc,
        createVersion: true,
        versionReason: "Milestone M5 edits",
      });

      expect(saveResult.success).toBe(true);

      // 9. Reload site from server (simulating browser reload)
      const reloaded = await caller.sites.get({ siteId: site.id });
      const reloadedDoc = reloaded.document!;

      // Verify changes persisted cleanly in database
      expect(reloadedDoc.elements[headingId!]).toBeDefined();
      expect(reloadedDoc.elements[headingId!]?.props["text"]).toBe("Awesome Website Title");
      expect(reloadedDoc.pages[aboutPageId!]).toBeDefined();
      expect(reloadedDoc.pages[aboutPageId!]?.name).toBe("About Us");
      expect(reloadedDoc.pages[aboutPageId!]?.slug).toBe("/about");

      // Verify version snapshot was created
      const [latestVersion] = await dbClient.db
        .select()
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.siteId, site.id));

      expect(latestVersion).toBeDefined();
      expect(latestVersion?.reason).toBe("Milestone M5 edits");
    });
  }
);
