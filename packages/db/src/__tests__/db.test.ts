import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeAllDbConnections, runMigrations, schema } from "../index.js";
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

const testDbUrl = process.env["DATABASE_URL_TEST"];

describe.skipIf(!testDbUrl)("PostgreSQL Real Integration Tests (builder_test)", () => {
  let dbClient: ReturnType<typeof getDb>;

  beforeAll(async () => {
    dbClient = getDb({ connectionUrl: testDbUrl });
    await runMigrations(dbClient.sql);
  });

  afterAll(async () => {
    await closeAllDbConnections();
  });

  it("creates user, workspace, and site with initial document", async () => {
    const { db } = dbClient;
    const testSuffix = Math.random().toString(36).substring(2, 8);
    const userId = `usr_${testSuffix}`;
    const wsId = `ws_${testSuffix}`;
    const siteId = `site_${testSuffix}`;

    // 1. Create user
    await db.insert(schema.users).values({
      id: userId,
      name: "Alice Builder",
      email: `alice_${testSuffix}@example.com`,
    });

    // 2. Create workspace
    await db.insert(schema.workspaces).values({
      id: wsId,
      name: "Alice Workspace",
      slug: `alice-ws-${testSuffix}`,
      ownerId: userId,
      plan: "free",
    });

    // 3. Add workspace member with OWNER role
    await db.insert(schema.workspaceMembers).values({
      id: `wsm_${testSuffix}`,
      workspaceId: wsId,
      userId,
      role: "OWNER",
    });

    // 4. Create site
    await db.insert(schema.sites).values({
      id: siteId,
      workspaceId: wsId,
      name: "Portfolio Site",
      slug: "portfolio",
    });

    // 5. Create initial site document
    const blankDoc = createBlankDocument("Portfolio Site");
    await db.insert(schema.siteDocuments).values({
      siteId,
      snapshot: blankDoc,
      schemaVersion: 1,
    });

    // Query and verify
    const [fetchedSite] = await db.select().from(schema.sites).where(eq(schema.sites.id, siteId));
    expect(fetchedSite).toBeDefined();
    expect(fetchedSite?.name).toBe("Portfolio Site");
    expect(fetchedSite?.workspaceId).toBe(wsId);

    const [fetchedDoc] = await db.select().from(schema.siteDocuments).where(eq(schema.siteDocuments.siteId, siteId));
    expect(fetchedDoc).toBeDefined();
    expect(fetchedDoc?.snapshot.site.name).toBe("Portfolio Site");
    expect(fetchedDoc?.schemaVersion).toBe(1);
  });

  it("enforces tenant isolation across different workspaces", async () => {
    const { db } = dbClient;
    const suffix1 = Math.random().toString(36).substring(2, 8);
    const suffix2 = Math.random().toString(36).substring(2, 8);

    // User 1 + WS 1
    const u1 = `u1_${suffix1}`;
    const ws1 = `ws1_${suffix1}`;
    const s1 = `s1_${suffix1}`;
    await db.insert(schema.users).values({ id: u1, name: "User 1", email: `u1_${suffix1}@example.com` });
    await db.insert(schema.workspaces).values({ id: ws1, name: "WS 1", slug: `ws1-${suffix1}`, ownerId: u1 });
    await db.insert(schema.sites).values({ id: s1, workspaceId: ws1, name: "Site 1" });

    // User 2 + WS 2
    const u2 = `u2_${suffix2}`;
    const ws2 = `ws2_${suffix2}`;
    const s2 = `s2_${suffix2}`;
    await db.insert(schema.users).values({ id: u2, name: "User 2", email: `u2_${suffix2}@example.com` });
    await db.insert(schema.workspaces).values({ id: ws2, name: "WS 2", slug: `ws2-${suffix2}`, ownerId: u2 });
    await db.insert(schema.sites).values({ id: s2, workspaceId: ws2, name: "Site 2" });

    // When querying sites belonging to ws1, site s2 is not returned
    const ws1Sites = await db.select().from(schema.sites).where(eq(schema.sites.workspaceId, ws1));
    expect(ws1Sites.some((s) => s.id === s1)).toBe(true);
    expect(ws1Sites.some((s) => s.id === s2)).toBe(false);
  });
});
