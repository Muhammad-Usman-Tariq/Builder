import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { createAuth } from "@builder/auth";
import { appRouter } from "../server/routers/_app";

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

describe.skipIf(!testDbUrl)("Milestone M3 Acceptance Test: Auth, Workspaces, Sites & Isolation", () => {
  let dbClient: ReturnType<typeof getDb>;
  let testAuth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    dbClient = getDb({ connectionUrl: testDbUrl });
    await runMigrations(dbClient.sql);
    testAuth = createAuth({
      db: dbClient.db,
      secret: "acceptance-test-auth-secret-32-chars-long!",
      baseURL: "http://localhost:3000",
    });
  });

  afterAll(async () => {
    await closeAllDbConnections();
  });

  function createTestCaller(user: any, session: any) {
    return appRouter.createCaller({
      db: dbClient.db,
      auth: testAuth as any,
      headers: new Headers(),
      user,
      session,
    });
  }

  it("completes full M3 loop: sign up -> create site -> duplicate -> dashboard -> cross-tenant isolation", async () => {
    const testSuffix = Math.random().toString(36).substring(2, 8);

    // 1. Sign up User 1 (Alice)
    const aliceRes = await testAuth.api.signUpEmail({
      body: {
        name: `Alice ${testSuffix}`,
        email: `alice_${testSuffix}@example.com`,
        password: "Password123!Secure",
      },
    });
    expect(aliceRes.user).toBeDefined();

    // Query Alice's auto-created workspace
    const [aliceWs] = await dbClient.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.ownerId, aliceRes.user.id));
    expect(aliceWs).toBeDefined();

    const aliceCaller = createTestCaller(aliceRes.user, { id: "alice_sess" });

    // 2. Alice creates a site
    const createdSite = (await aliceCaller.sites.create({
      workspaceId: aliceWs!.id,
      name: "Alice Artisan Bakery",
    }))!;
    expect(createdSite.id).toBeDefined();
    expect(createdSite.name).toBe("Alice Artisan Bakery");

    // Verify initial document was created in PostgreSQL
    const [docRow] = await dbClient.db
      .select()
      .from(schema.siteDocuments)
      .where(eq(schema.siteDocuments.siteId, createdSite.id));
    expect(docRow).toBeDefined();
    expect(docRow?.snapshot.site.name).toBe("Alice Artisan Bakery");

    // 3. Alice duplicates the site
    const clonedSite = (await aliceCaller.sites.duplicate({
      siteId: createdSite.id,
      newName: "Alice Artisan Bakery (Branch 2)",
    }))!;
    expect(clonedSite.id).toBeDefined();
    expect(clonedSite.id).not.toBe(createdSite.id);
    expect(clonedSite.name).toBe("Alice Artisan Bakery (Branch 2)");

    // 4. Alice lists sites in her dashboard -> sees both sites
    const aliceSites = await aliceCaller.sites.list({
      workspaceId: aliceWs!.id,
    });
    expect(aliceSites.length).toBe(2);
    expect(aliceSites.some((s) => s.id === createdSite.id)).toBe(true);
    expect(aliceSites.some((s) => s.id === clonedSite.id)).toBe(true);

    // 5. Alice renames the duplicate site
    const renamed = (await aliceCaller.sites.rename({
      siteId: clonedSite.id,
      name: "Alice Downtown Cafe",
    }))!;
    expect(renamed.name).toBe("Alice Downtown Cafe");

    // 6. Sign up User 2 (Bob) in a separate workspace
    const bobRes = await testAuth.api.signUpEmail({
      body: {
        name: `Bob ${testSuffix}`,
        email: `bob_${testSuffix}@example.com`,
        password: "Password123!Secure",
      },
    });
    expect(bobRes.user).toBeDefined();

    const [bobWs] = await dbClient.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.ownerId, bobRes.user.id));
    expect(bobWs).toBeDefined();
    expect(bobWs!.id).not.toBe(aliceWs!.id);

    const bobCaller = createTestCaller(bobRes.user, { id: "bob_sess" });

    // 7. Bob checks his dashboard -> sees 0 sites (cannot see Alice's sites)
    const bobSites = await bobCaller.sites.list({
      workspaceId: bobWs!.id,
    });
    expect(bobSites.length).toBe(0);

    // 8. Security & Isolation checks: Bob tries to access or tamper with Alice's resources
    // a. Bob tries to list sites from Alice's workspace
    await expect(
      bobCaller.sites.list({ workspaceId: aliceWs!.id })
    ).rejects.toThrow(TRPCError);

    // b. Bob tries to query Alice's site directly
    await expect(
      bobCaller.sites.get({ siteId: createdSite.id })
    ).rejects.toThrow(TRPCError);

    // c. Bob tries to duplicate Alice's site
    await expect(
      bobCaller.sites.duplicate({ siteId: createdSite.id })
    ).rejects.toThrow(TRPCError);

    // d. Bob tries to rename Alice's site
    await expect(
      bobCaller.sites.rename({ siteId: createdSite.id, name: "Hacked Site" })
    ).rejects.toThrow(TRPCError);

    // e. Bob tries to delete Alice's site
    await expect(
      bobCaller.sites.trash({ siteId: createdSite.id })
    ).rejects.toThrow(TRPCError);

    // 9. Soft-delete and restore checks
    // Alice moves site to trash
    await aliceCaller.sites.trash({ siteId: createdSite.id });

    // Normal list excludes trashed sites
    const activeSites = await aliceCaller.sites.list({
      workspaceId: aliceWs!.id,
      includeTrash: false,
    });
    expect(activeSites.length).toBe(1);
    expect(activeSites.some((s) => s.id === createdSite.id)).toBe(false);

    // Trashed list includes it
    const allSites = await aliceCaller.sites.list({
      workspaceId: aliceWs!.id,
      includeTrash: true,
    });
    expect(allSites.length).toBe(2);

    // Alice restores site
    await aliceCaller.sites.restore({ siteId: createdSite.id });
    const restoredSites = await aliceCaller.sites.list({
      workspaceId: aliceWs!.id,
      includeTrash: false,
    });
    expect(restoredSites.length).toBe(2);
  });
});
