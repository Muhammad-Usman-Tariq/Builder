import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
import * as aiModule from "@builder/ai";
import * as storageModule from "@builder/storage";
import { createYDocFromState, yDocToSiteDocument, type SiteDocument, DEFAULT_BREAKPOINTS } from "@builder/document";

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
  "Integration: AI Generation Worker Runtime with Simulated Problem AI Output (Batch A)",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let worker: ReturnType<typeof createWorker>;
    let subscriber: ReturnType<typeof createRedisConnection>;
    let redisCmd: ReturnType<typeof createRedisConnection>;
    let testWsId: string;
    let testUserId: string;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_ai_${randomUUID().slice(0, 8)}`;
      testWsId = `ws_ai_${randomUUID().slice(0, 8)}`;

      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        email: `aitest_${Date.now()}@example.com`,
        name: "AI Worker Tester",
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "AI Test Workspace",
        slug: `ws-ai-${Date.now()}`,
        ownerId: testUserId,
      });

      subscriber = createRedisConnection(redisUrl);
      redisCmd = createRedisConnection(redisUrl);
      worker = createWorker(redisUrl);
    });

    afterAll(async () => {
      await worker?.close();
      await subscriber?.quit();
      await redisCmd?.quit();
      await closeJobsQueue();
      await closeAllDbConnections();
    });

    it("worker normalizes and repairs problem cases from AI logs (empty slug, padding shorthand, raw flex) and saves matching snapshot + yjs_state", async () => {
      const siteId = `site_ai_${randomUUID().slice(0, 8)}`;

      // Create target site in DB with initial blank document
      await dbClient.db.insert(schema.sites).values({
        id: siteId,
        workspaceId: testWsId,
        name: "AI Bistro",
        slug: `bistro-${Date.now()}`,
      });

      // Simulate AI returning problem values from real worker log:
      // - Page 2 has empty slug ""
      // - Style has padding: "16px 24px" and flex: 1
      const plan: aiModule.AiSitePlan = {
        brief: {
          businessType: "Modern Bistro",
          audience: "Food lovers",
          tone: "Warm",
          goals: ["Reservations", "Menu showcase", "Contact"],
          primaryColorName: "amber",
        },
        theme: {
          colors: {
            primary: "#d97706",
            secondary: "#451a03",
            background: "#ffffff",
            surface: "#fef3c7",
            text: "#1c1917",
            muted: "#78716c",
            border: "#e7e5e4",
            accent: "#f59e0b",
          },
          fonts: {
            heading: "Playfair Display",
            body: "Inter",
          },
          spacing: 8,
          radius: 8,
        },
        pages: [
          {
            name: "Home",
            slug: "", // AI left slug empty for home!
            title: "Home - Modern Bistro",
            description: "Welcome to Bistro",
            sections: [
              {
                name: "Hero",
                purpose: "Welcome hero",
                layout: "hero",
              },
            ],
          },
          {
            name: "Menu",
            slug: "", // AI left slug empty for menu too!
            title: "Menu - Modern Bistro",
            description: "Our seasonal dishes",
            sections: [
              {
                name: "Menu List",
                purpose: "Dish list",
                layout: "content",
              },
            ],
          },
        ],
      };

      const pageSections: Record<string, aiModule.AiSection[]> = {
        "": [
          {
            name: "Hero Section",
            purpose: "Hero",
            tree: {
              type: "Section",
              name: "Hero Section",
              style: {
                padding: "16px 24px", // Shorthand from real log!
              },
              children: [
                {
                  type: "Heading",
                  name: "Hero Title",
                  level: 1,
                  text: "Finest Artisan Dining",
                  style: {
                    flex: 1, // Raw number from real log!
                  },
                },
              ],
            },
          },
        ],
      };

      // Spy on generateFullSite to return compiled document with repair
      const compiledDoc = aiModule.compileAiSiteDocument({
        siteName: "AI Bistro",
        plan,
        pageSections,
      });

      const spy = vi.spyOn(aiModule, "generateFullSite").mockResolvedValueOnce(compiledDoc);

      const testJobId = `job_ai_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const channel = getJobProgressChannel(testJobId);
      const receivedEvents: JobProgressEvent[] = [];

      await subscriber.subscribe(channel);
      const messageHandler = (ch: string, msg: string) => {
        if (ch === channel) {
          receivedEvents.push(JSON.parse(msg));
        }
      };
      subscriber.on("message", messageHandler);

      // Enqueue job
      await enqueueJob({
        jobId: testJobId,
        workspaceId: testWsId,
        type: "ai:generate-site",
        input: {
          siteId,
          prompt: "Artisan bistro website with menu and reservations",
          userId: testUserId,
          reservedUnits: 10,
        },
      });

      // Wait for job completion
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        if (receivedEvents.some((e) => e.status === "succeeded" || e.status === "failed")) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      subscriber.off("message", messageHandler);
      spy.mockRestore();

      const successEvent = receivedEvents.find((e) => e.status === "succeeded");
      expect(successEvent).toBeDefined();
      expect(successEvent?.progress).toBe(100);

      // Verify DB persistence: siteDocuments has both snapshot AND matching yjsState
      const [savedDocRow] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, siteId));

      expect(savedDocRow).toBeDefined();
      expect(savedDocRow?.snapshot).toBeDefined();
      expect(savedDocRow?.yjsState).toBeDefined();

      const snapshot = savedDocRow!.snapshot as unknown as SiteDocument;
      const pages = Object.values(snapshot.pages);
      expect(pages.length).toBe(2);

      // Slugs were repaired: one is "/", one is "/menu"
      const slugs = pages.map((p) => p.slug);
      expect(slugs).toContain("/");
      expect(slugs).toContain("/menu");

      // Verify yjs_state decodes to the exact same document pages
      const yDoc = createYDocFromState(new Uint8Array(savedDocRow!.yjsState!));
      const yjsDoc = yDocToSiteDocument(yDoc);
      expect(Object.keys(yjsDoc.pages).length).toBe(2);

      // Verify site version snapshot was saved
      const versions = await dbClient.db
        .select()
        .from(schema.siteVersions)
        .where(eq(schema.siteVersions.siteId, siteId));
      expect(versions.length).toBeGreaterThanOrEqual(1);
    }, 20000);

    it("enforces single active generation job lock per site", async () => {
      const siteId = `site_lock_${randomUUID().slice(0, 8)}`;

      // Create target site
      await dbClient.db.insert(schema.sites).values({
        id: siteId,
        workspaceId: testWsId,
        name: "Lock Site",
        slug: `lock-${Date.now()}`,
      });

      // Manually acquire lock in redis using command connection
      const lockKey = `lock:site-gen:${siteId}`;
      await redisCmd.set(lockKey, "another_job", "EX", 60);

      const testJobId = `job_lock_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const channel = getJobProgressChannel(testJobId);
      const receivedEvents: JobProgressEvent[] = [];

      await subscriber.subscribe(channel);
      const messageHandler = (ch: string, msg: string) => {
        if (ch === channel) {
          receivedEvents.push(JSON.parse(msg));
        }
      };
      subscriber.on("message", messageHandler);

      await enqueueJob({
        jobId: testJobId,
        workspaceId: testWsId,
        type: "ai:generate-site",
        input: {
          siteId,
          prompt: "Should fail due to lock",
          userId: testUserId,
        },
      });

      const startTime = Date.now();
      while (Date.now() - startTime < 10000) {
        if (receivedEvents.some((e) => e.status === "failed")) break;
        await new Promise((r) => setTimeout(r, 200));
      }

      subscriber.off("message", messageHandler);
      await redisCmd.del(lockKey);

      const failedEvent = receivedEvents.find((e) => e.status === "failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent?.error).toContain("already running");
    });

    it("worker fills stock photos with simulated AI provider and recorded Unsplash response", async () => {
      const siteId = `site_img_${randomUUID().slice(0, 8)}`;

      // Create target site
      await dbClient.db.insert(schema.sites).values({
        id: siteId,
        workspaceId: testWsId,
        name: "Coffee Shop",
        slug: `coffee-${Date.now()}`,
      });

      const initialDoc: SiteDocument = {
        schemaVersion: 1,
        site: { name: "Coffee Shop", defaultLocale: "en", locales: ["en"] },
        breakpoints: DEFAULT_BREAKPOINTS,
        tokens: {
          colors: { "color.primary": "#78350f" },
          fonts: { heading: "Playfair Display", body: "Inter", mono: "monospace" },
          spacing: { "space.sm": "8px" },
          radius: { "radius.md": "8px" },
          shadows: { "shadow.sm": "0 1px 2px rgba(0,0,0,0.05)" },
        },
        elements: {
          el_body: {
            id: "el_body",
            type: "Body",
            name: "Page Body",
            parentId: null,
            children: ["el_sec"],
            styleIds: [],
            props: {},
            origin: "ai",
            aiLocked: false,
          },
          el_sec: {
            id: "el_sec",
            type: "Section",
            name: "Hero Section",
            parentId: "el_body",
            children: ["el_img"],
            styleIds: [],
            props: {},
            origin: "ai",
            aiLocked: false,
          },
          el_img: {
            id: "el_img",
            type: "Image",
            name: "Coffee Image",
            parentId: "el_sec",
            children: [],
            styleIds: [],
            props: {
              src: "",
              alt: "Artisan coffee beans",
              imageQuery: "artisan coffee roasting",
            },
            origin: "ai",
            aiLocked: false,
          },
        },
        styles: {},
        pages: {
          pg_home: {
            id: "pg_home",
            name: "Home",
            slug: "/",
            rootId: "el_body",
            seo: {},
            status: "draft",
          },
        },
        components: {},
        assets: {},
      };

      // Mock AI generateFullSite to return our test doc
      const aiSpy = vi.spyOn(aiModule, "generateFullSite").mockResolvedValueOnce(initialDoc);

      // Spy on copyRemoteImageToStorage so it doesn't require remote image fetching
      const copySpy = vi.spyOn(storageModule, "copyRemoteImageToStorage").mockResolvedValue({
        publicUrl: "https://res.cloudinary.com/demo/image/upload/v1/mock_coffee_999.jpg",
        key: "workspaces/test/mock_coffee_999.jpg",
        providerFileId: "mock_coffee_999",
        provider: "cloudinary",
      });

      // Set temporary UNSPLASH_ACCESS_KEY if not set
      const prevUnsplashKey = process.env["UNSPLASH_ACCESS_KEY"];
      process.env["UNSPLASH_ACCESS_KEY"] = "mock_unsplash_key_123";

      // Mock fetch for Unsplash API endpoint
      const originalFetch = global.fetch;
      const fetchSpy = vi.fn().mockImplementation(async (url: any) => {
        const u = String(url);
        if (u.includes("api.unsplash.com/search/photos")) {
          return new Response(
            JSON.stringify({
              total: 1,
              total_pages: 1,
              results: [
                {
                  id: "coffee_photo_999",
                  width: 1920,
                  height: 1080,
                  description: "Rich dark roast coffee beans",
                  alt_description: "Artisan roasted coffee beans in rustic scoop",
                  urls: {
                    regular: "https://images.unsplash.com/mock-coffee-999.jpg",
                  },
                  user: {
                    name: "Barista Bob",
                    links: {
                      html: "https://unsplash.com/@baristabob",
                    },
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        return originalFetch(url);
      });
      global.fetch = fetchSpy as any;

      const testJobId = `job_img_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const channel = getJobProgressChannel(testJobId);
      const receivedEvents: JobProgressEvent[] = [];

      await subscriber.subscribe(channel);
      const messageHandler = (ch: string, msg: string) => {
        if (ch === channel) {
          receivedEvents.push(JSON.parse(msg));
        }
      };
      subscriber.on("message", messageHandler);

      try {
        await enqueueJob({
          jobId: testJobId,
          workspaceId: testWsId,
          type: "ai:generate-site",
          input: {
            siteId,
            prompt: "Specialty coffee shop landing page",
            userId: testUserId,
          },
        });

        const startTime = Date.now();
        while (Date.now() - startTime < 15000) {
          if (receivedEvents.some((e) => e.status === "succeeded")) break;
          if (receivedEvents.some((e) => e.status === "failed")) break;
          await new Promise((r) => setTimeout(r, 200));
        }

        const successEvent = receivedEvents.find((e) => e.status === "succeeded");
        expect(successEvent).toBeDefined();

        // Verify document saved in DB has filled stock photo with attribution
        const [savedDocRecord] = await dbClient.db
          .select()
          .from(schema.siteDocuments)
          .where(eq(schema.siteDocuments.siteId, siteId));

        expect(savedDocRecord).toBeDefined();
        const savedDoc = savedDocRecord!.snapshot as SiteDocument;
        const imgElement = savedDoc.elements["el_img"];
        expect(imgElement).toBeDefined();
        expect(imgElement?.props["src"]).toBeTruthy();
        expect(imgElement?.props["unsplashPhotoId"]).toBe("coffee_photo_999");
        expect(imgElement?.props["unsplashAuthor"]).toBe("Barista Bob");
        expect(imgElement?.props["unsplashAttribution"]).toContain("Barista Bob");
        expect(Object.keys(savedDoc.assets).length).toBeGreaterThan(0);
      } finally {
        subscriber.off("message", messageHandler);
        global.fetch = originalFetch;
        aiSpy.mockRestore();
        copySpy.mockRestore();
        if (prevUnsplashKey !== undefined) {
          process.env["UNSPLASH_ACCESS_KEY"] = prevUnsplashKey;
        } else {
          delete process.env["UNSPLASH_ACCESS_KEY"];
        }
      }
    }, 25000);
  }
);
