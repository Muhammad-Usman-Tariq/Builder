import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { isStorageConfigured } from "@builder/storage";
import { eq } from "drizzle-orm";
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
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping M6 acceptance tests.");
}

describe.skipIf(!isDbConfigured)(
  "Milestone M6 Acceptance Test: Media Library, Presigned S3 Upload, Confirmation, and Unsplash",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let caller: ReturnType<typeof appRouter.createCaller>;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m6_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m6_${Math.random().toString(36).substring(2, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "M6 Tester",
        email: `tester_m6_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "M6 Test Workspace",
        slug: `m6-ws-${Date.now()}`,
        ownerId: testUserId,
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wsm_m6_${Date.now()}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        user: { id: testUserId, name: "M6 Tester", email: `tester_m6_${Date.now()}@example.com` } as any,
        session: { id: "sess_m6_test", userId: testUserId, expiresAt: new Date(Date.now() + 86400000) } as any,
      });
    });

    afterAll(async () => {
      await closeAllDbConnections();
    });

    it("completes full M6 media lifecycle: presign upload -> confirm asset -> list library -> search Unsplash", async (ctx) => {
      if (!isStorageConfigured()) {
        ctx.skip();
        console.log("SKIPPED: needs S3_* in .env");
        return;
      }

      // 1. Presign upload
      const presignResult = await caller.assets.presign({
        workspaceId: testWsId,
        filename: "hero-banner.png",
        mimeType: "image/png",
        size: 1024 * 50,
      });

      if (!presignResult.asset) throw new Error("Expected asset in presign result");
      const asset = presignResult.asset;
      expect(asset.id).toBeDefined();
      expect(presignResult.uploadUrl).toBeDefined();
      expect(asset.key).toContain("hero-banner");

      // Verify asset record created in DB
      const [pendingAsset] = await dbClient.db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.id, asset.id));

      expect(pendingAsset).toBeDefined();
      expect(pendingAsset?.key).toContain("hero-banner");
      expect(pendingAsset?.type).toBe("image/png");

      // Actually upload real 1x1 test image to the storage provider
      const testPngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
      const testBlob = new Blob([testPngBuffer], { type: "image/png" });

      try {
        if (presignResult.upload && presignResult.upload.method === "POST") {
          const formData = new FormData();
          for (const [k, v] of Object.entries(presignResult.upload.fields || {})) {
            formData.append(k, String(v));
          }
          formData.append("file", testBlob, "hero-banner.png");
          const uploadRes = await fetch(presignResult.upload.url, {
            method: "POST",
            body: formData,
          });
          expect(uploadRes.ok).toBe(true);
        } else if (presignResult.uploadUrl) {
          const uploadRes = await fetch(presignResult.uploadUrl, {
            method: "PUT",
            body: testBlob,
            headers: {
              "Content-Type": "image/png",
            },
          });
          expect(uploadRes.ok).toBe(true);
        }

        // 2. Confirm upload with real provider check
        const confirmResult = await caller.assets.confirm({
          workspaceId: testWsId,
          assetId: asset.id,
        });

        expect(confirmResult.success).toBe(true);
      } catch (uploadErr: any) {
        if (uploadErr?.code === "EAI_AGAIN" || uploadErr?.message?.includes("fetch failed")) {
          console.log("Storage upload skipped due to network/DNS resolution error:", uploadErr.message);
          ctx.skip();
          return;
        }
        throw uploadErr;
      }

      // 3. List assets in workspace
      const assetList = await caller.assets.list({
        workspaceId: testWsId,
      });

      expect(assetList.length).toBeGreaterThan(0);
      const found = assetList.find((a) => a.id === asset.id);
      expect(found).toBeDefined();
      expect(found?.publicUrl).toBeDefined();

      // 4. Clean up test asset from storage and DB
      const deleteRes = await caller.assets.delete({
        workspaceId: testWsId,
        assetId: asset.id,
      });
      expect(deleteRes.success).toBe(true);

      // 5. Test Unsplash search integration
      const unsplashRes = await caller.assets.searchUnsplash({
        workspaceId: testWsId,
        query: "minimal architecture",
        perPage: 5,
      });

      // Even without API key in dev, returns safe object with configured flag
      expect(unsplashRes).toHaveProperty("configured");
      expect(Array.isArray(unsplashRes.photos)).toBe(true);
    }, 30000);
  }
);
