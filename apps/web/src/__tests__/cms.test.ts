import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { createAuth } from "@builder/auth";
import { appRouter } from "../server/routers/_app";
import { createBlankDocument } from "@builder/document";

// Auto-load root .env if running standalone
const envFile = path.resolve(process.cwd(), "../../.env");
if (!process.env["DATABASE_URL_TEST"] && fs.existsSync(envFile)) {
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
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping CMS router integration tests.");
}

describe.skipIf(!isDbConfigured)("Batch E2: Small CMS Router Integration Tests", () => {
  let dbClient: ReturnType<typeof getDb>;
  let testAuth: ReturnType<typeof createAuth>;
  let testUser: any;
  let testSession: any;
  let testSite: any;

  beforeAll(async () => {
    dbClient = getDb({ connectionUrl: testDbUrl });
    await runMigrations(dbClient.sql);
    testAuth = createAuth({
      db: dbClient.db,
      secret: "acceptance-test-auth-secret-32-chars-long!",
      baseURL: "http://localhost:3000",
    });

    const suffix = Math.random().toString(36).substring(2, 8);
    const userId = `usr_${suffix}`;
    const [u] = await dbClient.db
      .insert(schema.users)
      .values({
        id: userId,
        email: `cms-tester-${suffix}@example.com`,
        name: "CMS Tester",
      })
      .returning();
    testUser = u!;

    const [ws] = await dbClient.db
      .insert(schema.workspaces)
      .values({
        id: `ws_${suffix}`,
        name: `CMS Workspace ${suffix}`,
        slug: `cms-ws-${suffix}`,
        ownerId: u!.id,
      })
      .returning();

    await dbClient.db.insert(schema.workspaceMembers).values({
      id: `wsm_${suffix}`,
      workspaceId: ws!.id,
      userId: u!.id,
      role: "OWNER",
    });

    const [st] = await dbClient.db
      .insert(schema.sites)
      .values({
        id: `site_${suffix}`,
        workspaceId: ws!.id,
        name: `CMS Test Site ${suffix}`,
        slug: `cms-site-${suffix}`,
      })
      .returning();
    testSite = st!;

    // Seed empty site document
    const blankDoc = createBlankDocument(`CMS Test Site ${suffix}`);
    await dbClient.db.insert(schema.siteDocuments).values({
      siteId: st!.id,
      snapshot: blankDoc,
    });

    testSession = {
      id: `sess_${suffix}`,
      userId: u!.id,
      expiresAt: new Date(Date.now() + 86400000),
      activeWorkspaceId: ws!.id,
    };
  });

  afterAll(async () => {
    await closeAllDbConnections();
  });

  function createCaller() {
    return appRouter.createCaller({
      db: dbClient.db,
      auth: testAuth as any,
      headers: new Headers(),
      user: testUser,
      session: testSession,
    });
  }

  it("performs full CRUD on collections and entries with search", async () => {
    const caller = createCaller();

    // 1. Create collection
    const col = await caller.cms.createCollection({
      siteId: testSite.id,
      name: "Products",
    });
    expect(col!.name).toBe("Products");
    expect(col!.slug).toBe("products");

    // 2. List collections
    let cols = await caller.cms.listCollections({ siteId: testSite.id });
    expect(cols.some((c) => c.id === col!.id)).toBe(true);

    // 3. Rename collection
    const renamed = await caller.cms.renameCollection({
      siteId: testSite.id,
      collectionId: col!.id,
      name: "Store Items",
    });
    expect(renamed!.name).toBe("Store Items");

    // 4. Create entries
    const ent1 = await caller.cms.createEntry({
      siteId: testSite.id,
      collectionId: col!.id,
      title: "Ergonomic Mechanical Keyboard",
      status: "published",
      data: {
        price: 149,
      },
    });
    expect(ent1!.title).toBe("Ergonomic Mechanical Keyboard");
    expect(ent1!.slug).toBe("ergonomic-mechanical-keyboard");

    const ent2 = await caller.cms.createEntry({
      siteId: testSite.id,
      collectionId: col!.id,
      title: "Wireless Trackball Mouse",
      status: "draft",
    });

    // 5. List entries with search
    const searchRes = await caller.cms.listEntries({
      siteId: testSite.id,
      collectionId: col!.id,
      search: "mechanical",
    });
    expect(searchRes.length).toBe(1);
    expect(searchRes[0]?.id).toBe(ent1!.id);

    // Filter by status
    const pubRes = await caller.cms.listEntries({
      siteId: testSite.id,
      collectionId: col!.id,
      status: "published",
    });
    expect(pubRes.length).toBe(1);
    expect(pubRes[0]?.id).toBe(ent1!.id);

    // 6. Update entry
    const updated = await caller.cms.updateEntry({
      siteId: testSite.id,
      entryId: ent1!.id,
      title: "Pro Mechanical Keyboard",
    });
    expect(updated!.title).toBe("Pro Mechanical Keyboard");

    // 7. Delete entry
    await caller.cms.deleteEntry({
      siteId: testSite.id,
      entryId: ent2!.id,
    });
    const afterDelete = await caller.cms.listEntries({
      siteId: testSite.id,
      collectionId: col!.id,
    });
    expect(afterDelete.length).toBe(1);

    // 8. Delete collection
    await caller.cms.deleteCollection({
      siteId: testSite.id,
      collectionId: col!.id,
    });
    cols = await caller.cms.listCollections({ siteId: testSite.id });
    expect(cols.some((c) => c.id === col!.id)).toBe(false);
  });

  it("executes 'Add sample blog' and 'Remove sample content' cleanly", async () => {
    const caller = createCaller();

    // 1. Add sample blog
    const addRes = await caller.cms.addSampleBlog({
      siteId: testSite.id,
    });
    expect(addRes.success).toBe(true);
    expect(addRes.collection!.name).toBe("Blog");
    expect(addRes.posts.length).toBe(3);

    // Verify document now has /blog and /blog/[slug] pages
    const [docRow] = await dbClient.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, testSite.id));
    const doc = docRow?.snapshot as any;
    expect(doc.pages["page_blog"]).toBeDefined();
    expect(doc.pages["page_blog"].slug).toBe("/blog");
    expect(doc.pages["page_blog_post"]).toBeDefined();
    expect(doc.pages["page_blog_post"].slug).toBe("/blog/[slug]");
    expect(doc.pages["page_blog_post"].cmsTemplate).toBeDefined();

    // Verify 3 published entries exist
    const entries = await caller.cms.listEntries({
      siteId: testSite.id,
      collectionId: addRes.collection!.id,
    });
    expect(entries.length).toBe(3);

    // 2. Remove sample blog
    const removeRes = await caller.cms.removeSampleBlog({
      siteId: testSite.id,
    });
    expect(removeRes.success).toBe(true);

    // Verify pages were cleaned up from document
    const [afterDocRow] = await dbClient.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, testSite.id));
    const afterDoc = afterDocRow?.snapshot as any;
    expect(afterDoc.pages["page_blog"]).toBeUndefined();
    expect(afterDoc.pages["page_blog_post"]).toBeUndefined();

    // Verify sample entries were removed
    const remainingEntries = await caller.cms.listEntries({
      siteId: testSite.id,
      collectionId: addRes.collection!.id,
    });
    expect(remainingEntries.length).toBe(0);
  });
});
