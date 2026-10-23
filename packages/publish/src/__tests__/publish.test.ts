import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { createBlankDocument, insertElement, createYDoc, yDocToSiteDocument } from "@builder/document";
import {
  encryptSecret,
  decryptSecret,
  validatePreflight,
  generateSafeVercelProjectName,
  isTransientVercelError,
} from "../index.js";
import { buildStaticSite } from "../builder.js";

const testKey = crypto.randomBytes(32).toString("base64");

describe("Milestone M9: Publishing Pipeline and Static Compilation", () => {
  describe("AES-256-GCM Secrets Encryption", () => {
    it("successfully encrypts and decrypts secrets with integrity validation", () => {
      const plaintext = "vercel_tok_secret_access_key_123456789";
      const encrypted = encryptSecret(plaintext, testKey);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(":").length).toBe(3);

      const decrypted = decryptSecret(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it("fails when ciphertext or authentication tag is tampered with", () => {
      const plaintext = "my_secret_token";
      const encrypted = encryptSecret(plaintext, testKey);
      const parts = encrypted.split(":");

      // Corrupt the ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2]?.slice(0, -2)}ff`;
      expect(() => decryptSecret(tampered, testKey)).toThrow();
    });

    it("fails when decrypted with the wrong encryption key", () => {
      const plaintext = "another_secret";
      const encrypted = encryptSecret(plaintext, testKey);
      const wrongKey = crypto.randomBytes(32).toString("base64");

      expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
    });
  });

  describe("Pre-flight Validation (PUB-001)", () => {
    it("passes when site document is valid and Vercel connection is present", () => {
      const doc = createBlankDocument("Preflight Test");
      const result = validatePreflight(doc, { hasVercelConnection: true });

      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails with PUB_NO_VERCEL_CONNECTION when Vercel is not connected", () => {
      const doc = createBlankDocument("Preflight Test");
      const result = validatePreflight(doc, { hasVercelConnection: false });

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.code === "PUB_NO_VERCEL_CONNECTION")).toBe(true);
    });

    it("fails with PUB_BROKEN_LINK when an element links to a non-existent page", () => {
      const yDoc = createYDoc();
      const doc = yDocToSiteDocument(yDoc);
      const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Link",
          name: "Broken Link",
          props: { text: "Go to missing", href: "/missing-page-slug" },
        },
      });

      const updated = yDocToSiteDocument(yDoc);
      const result = validatePreflight(updated, { hasVercelConnection: true });

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.code === "PUB_BROKEN_LINK")).toBe(true);
    });
  });

  describe("Static Site Builder", () => {
    it("builds clean HTML, CSS, assets, sitemap, robots.txt, and vercel.json with security headers", () => {
      const doc = createBlankDocument("Static Site Showcase");
      const pageId = Object.keys(doc.pages)[0]!;

      // Add a form to test form client script integration
      const yDoc = createYDoc(doc);
      const bodyId = doc.pages[pageId]!.rootId;

      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Form",
          name: "Contact Form",
          props: { name: "ContactUs" },
        },
      });

      const populatedDoc = yDocToSiteDocument(yDoc);
      const build = buildStaticSite(populatedDoc, {
        siteId: "site_test_123",
        domainUrl: "https://mysite.com",
        apiPublicUrl: "https://api.builder.dev",
      });

      // 1. Files generated
      expect(build.files["index.html"]).toBeDefined();
      expect(build.files["assets/site.css"]).toBeDefined();
      expect(build.files["assets/forms.js"]).toBeDefined();
      expect(build.files["sitemap.xml"]).toBeDefined();
      expect(build.files["robots.txt"]).toBeDefined();
      expect(build.files["vercel.json"]).toBeDefined();

      // 2. HTML contains DOCTYPE, title, stylesheets, and body
      const indexHtml = build.files["index.html"]!;
      expect(indexHtml).toContain("<!DOCTYPE html>");
      expect(indexHtml).toContain("<title>Static Site Showcase</title>");
      expect(indexHtml).toContain('<link rel="stylesheet" href="/assets/site.css">');
      expect(indexHtml).toContain('<script defer src="/assets/forms.js"></script>');

      // 3. Sitemap contains URLs
      const sitemap = build.files["sitemap.xml"]!;
      expect(sitemap).toContain("<loc>https://mysite.com</loc>");

      // 4. vercel.json contains security headers
      const vercelConfig = JSON.parse(build.files["vercel.json"]!);
      expect(vercelConfig.cleanUrls).toBe(true);
      const headers = vercelConfig.headers[0].headers;
      const headerNames = headers.map((h: any) => h.key);
      expect(headerNames).toContain("Content-Security-Policy");
      expect(headerNames).toContain("Strict-Transport-Security");
      expect(headerNames).toContain("X-Frame-Options");
      expect(headerNames).toContain("X-Content-Type-Options");
      expect(headerNames).toContain("Referrer-Policy");
      expect(headerNames).toContain("Permissions-Policy");
    });

    it("builds the home page to index.html at the site root (never placeholder /_root_/index.html)", () => {
      const doc = createBlankDocument("Home Root Check");
      const pageId = Object.keys(doc.pages)[0]!;
      doc.pages[pageId]!.slug = "/";
      const build = buildStaticSite(doc, { siteId: "site_test_home" });

      expect(build.files["index.html"]).toBeDefined();
      expect(build.files["_root_/index.html"]).toBeUndefined();
      expect(build.pages.some((p) => p.slug === "/" && p.path === "index.html")).toBe(true);
    });

    it("copies images into assets/img/ and rewrites paths in output HTML", () => {
      const doc = createBlankDocument("Image Publishing Test");
      const pageId = Object.keys(doc.pages)[0]!;
      const yDoc = createYDoc(doc);
      const bodyId = doc.pages[pageId]!.rootId;

      const sampleSvgDataUri = "data:image/svg+xml;utf8,<svg><circle cx='5' cy='5' r='5'/></svg>";

      const imageId = insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Image",
          name: "Hero Image",
          props: { src: sampleSvgDataUri, alt: "Sample SVG" },
        },
      });

      const updated = yDocToSiteDocument(yDoc);
      const build = buildStaticSite(updated, {
        siteId: "site_test_images",
        assetImages: {
          "logo.png": "PNG_MOCK_BYTES",
        },
      });

      // Verification: image files exist under assets/img/
      expect(build.files[`assets/img/img-${imageId}.svg`]).toBeDefined();
      expect(build.files["assets/img/logo.png"]).toBe("PNG_MOCK_BYTES");

      // Verification: output HTML rewrites the src attribute to the relative assets/img/ path
      const indexHtml = build.files["index.html"]!;
      expect(indexHtml).toContain(`/assets/img/img-${imageId}.svg`);
    });

    it("preserves Cloudinary and external URLs from doc.assets and elements without 404 rewriting", () => {
      const doc = createBlankDocument("Bloom & Petal Florist");
      const pageId = Object.keys(doc.pages)[0]!;
      const yDoc = createYDoc(doc);
      const bodyId = doc.pages[pageId]!.rootId;

      const cloudinaryUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
      const unsplashUrl = "https://images.unsplash.com/photo-1518791841217-8f162f1e1131";

      const assetId = "ast_bloom_hero";
      doc.assets[assetId] = {
        id: assetId,
        name: "Bloom Hero",
        key: "cloudinary_sample",
        url: cloudinaryUrl,
        type: "image/jpeg",
        size: 1024,
      };

      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Image",
          name: "Hero Photo",
          props: { src: "", asset: { asset: assetId } as any, alt: "Bloom Hero" },
        },
      });

      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Image",
          name: "Direct Cloudinary Photo",
          props: { src: unsplashUrl, alt: "Direct Unsplash" },
        },
      });

      // Also empty image slot
      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Image",
          name: "Empty Image Slot",
          props: { src: "", alt: "Empty Slot" },
        },
      });

      const updated = yDocToSiteDocument(yDoc);
      updated.assets[assetId] = doc.assets[assetId]!;

      const build = buildStaticSite(updated, {
        siteId: "site_bloom_petal",
      });

      const indexHtml = build.files["index.html"]!;
      // Valid images are included and point to valid Cloudinary/external URL
      expect(indexHtml).toContain(cloudinaryUrl);
      expect(indexHtml).toContain(unsplashUrl);
      // Empty image slot is omitted in static HTML
      expect(indexHtml).not.toContain('alt="Empty Slot"');
    });

    it("fails the publish build with a clear message if any referenced local image file is missing", () => {
      const doc = createBlankDocument("Broken Images Site");
      const pageId = Object.keys(doc.pages)[0]!;
      const yDoc = createYDoc(doc);
      const bodyId = doc.pages[pageId]!.rootId;

      insertElement(yDoc, {
        parentId: bodyId,
        element: {
          type: "Image",
          name: "Missing Image",
          props: { src: "/assets/img/missing-photo.jpg", alt: "Missing" },
        },
      });

      const updated = yDocToSiteDocument(yDoc);
      expect(() =>
        buildStaticSite(updated, {
          siteId: "site_broken_img",
        })
      ).toThrow(/Missing referenced image file: "\/assets\/img\/missing-photo.jpg"/);
    });

    it("builds static pages for dynamic CMS entries matching collection template", () => {
      const doc = createBlankDocument("Blog Showcase");

      // Create a dynamic template page e.g. /blog/[slug]
      const dynamicPageId = "page_blog_post";
      doc.pages[dynamicPageId] = {
        id: dynamicPageId,
        name: "Blog Post Template",
        slug: "blog/[slug]",
        rootId: "elem_blog_root",
        status: "published",
        seo: { title: "Blog Post" },
        cmsTemplate: { collectionId: "col_blog_123" },
      };
      doc.elements["elem_blog_root"] = {
        id: "elem_blog_root",
        type: "Body",
        parentId: null,
        children: ["elem_blog_heading"],
        props: {},
        styleIds: [],
      };
      doc.elements["elem_blog_heading"] = {
        id: "elem_blog_heading",
        type: "CmsField",
        parentId: "elem_blog_root",
        children: [],
        props: { fieldKey: "title", fieldType: "text" },
        styleIds: [],
      };

      const cmsEntries = [
        {
          id: "entry_1",
          collectionId: "col_blog_123",
          title: "First Awesome Post",
          slug: "first-awesome-post",
          status: "published",
          data: { title: "First Awesome Post" },
        },
        {
          id: "entry_2",
          collectionId: "col_blog_123",
          title: "Second Great Post",
          slug: "second-great-post",
          status: "published",
          data: { title: "Second Great Post" },
        },
        {
          id: "entry_draft",
          collectionId: "col_blog_123",
          title: "Draft Post",
          slug: "draft-post",
          status: "draft",
          data: { title: "Draft Post" },
        },
      ];

      const build = buildStaticSite(doc, {
        siteId: "site_cms_test",
        cmsEntries,
      });

      // Verify that published entries generate static html pages
      expect(build.files["blog/first-awesome-post/index.html"]).toBeDefined();
      expect(build.files["blog/second-great-post/index.html"]).toBeDefined();

      // Verify that draft entries do NOT generate published static pages
      expect(build.files["blog/draft-post/index.html"]).toBeUndefined();

      // Verify content of generated page contains entry title
      expect(build.files["blog/first-awesome-post/index.html"]).toContain("First Awesome Post");
      expect(build.files["blog/second-great-post/index.html"]).toContain("Second Great Post");
    });
  });

  describe("Safe Vercel Project Name Generation (Section A.1)", () => {
    const testSiteId = "site_a1b2c3d4e5";

    it("handles names with spaces and lowercase conversion", () => {
      const name = generateSafeVercelProjectName("Artisan Bistro", testSiteId);
      expect(name).toBe("artisan-bistro-c3d4e5");
      expect(name).toMatch(/^[a-z0-9._-]+$/);
      expect(name).not.toContain("--");
    });

    it("handles names with capitals", () => {
      const name = generateSafeVercelProjectName("SUPER COOL SAAS", testSiteId);
      expect(name).toBe("super-cool-saas-c3d4e5");
      expect(name).not.toContain("--");
    });

    it("handles names with apostrophes and punctuation", () => {
      const name = generateSafeVercelProjectName("Joe's Famous BBQ & Grill!", testSiteId);
      expect(name).toBe("joe-s-famous-bbq-grill-c3d4e5");
      expect(name).toMatch(/^[a-z0-9._-]+$/);
      expect(name).not.toContain("--");
    });

    it("handles names with ampersands and special symbols", () => {
      const name = generateSafeVercelProjectName("Design & Development + More", testSiteId);
      expect(name).toBe("design-development-more-c3d4e5");
      expect(name).not.toContain("--");
    });

    it("handles names with emojis", () => {
      const name = generateSafeVercelProjectName("🚀 Star Pizza 🍕", testSiteId);
      expect(name).toBe("star-pizza-c3d4e5");
      expect(name).not.toContain("--");
    });

    it("handles names with non-Latin characters", () => {
      const name = generateSafeVercelProjectName("Café de Paris 日本 寿司", testSiteId);
      expect(name).toBe("caf-de-paris-c3d4e5");
      expect(name).toMatch(/^[a-z0-9._-]+$/);
      expect(name).not.toContain("--");
    });

    it("handles completely non-Latin or emoji names by falling back safely", () => {
      const name = generateSafeVercelProjectName("✨🎉🍣🍕", testSiteId);
      expect(name).toBe("site-c3d4e5");
      expect(name).toMatch(/^[a-z0-9._-]+$/);
    });

    it("collapses repeated dashes and trims leading/trailing punctuation", () => {
      const name = generateSafeVercelProjectName("---...___My---Project---___...", testSiteId);
      expect(name).toBe("my-project-c3d4e5");
      expect(name).not.toContain("---");
      expect(name).not.toContain("--");
    });

    it("enforces maximum 100 character limit", () => {
      const veryLong = "A".repeat(150);
      const name = generateSafeVercelProjectName(veryLong, testSiteId);
      expect(name.length).toBeLessThanOrEqual(100);
      expect(name.endsWith("-c3d4e5")).toBe(true);
    });
  });

  describe("Transient Vercel Error Classification (Section A.2)", () => {
    it("identifies 5xx and 429 as transient", () => {
      expect(isTransientVercelError(null, 500)).toBe(true);
      expect(isTransientVercelError(null, 502)).toBe(true);
      expect(isTransientVercelError(null, 503)).toBe(true);
      expect(isTransientVercelError(null, 429)).toBe(true);
    });

    it("identifies 400 and 401 as permanent", () => {
      expect(isTransientVercelError(null, 400)).toBe(false);
      expect(isTransientVercelError(null, 401)).toBe(false);
      expect(isTransientVercelError(null, 403)).toBe(false);
      expect(isTransientVercelError(null, 404)).toBe(false);
    });

    it("identifies network fetch errors as transient", () => {
      expect(isTransientVercelError(new Error("fetch failed"))).toBe(true);
      expect(isTransientVercelError(new Error("ECONNRESET: connection reset by peer"))).toBe(true);
      expect(isTransientVercelError(new Error("Rate limit exceeded"))).toBe(true);
    });
  });

  describe("Batch B: Team vs Personal Tokens and Instant Promote", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("detects teamId, teamSlug, teamName for team-scoped Vercel tokens", async () => {
      const { verifyVercelToken } = await import("../vercel.js");
      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/v2/user")) {
          return new Response(JSON.stringify({ user: { username: "dev_user", email: "dev@example.com" } }), {
            status: 200,
          });
        }
        if (urlStr.includes("/v2/teams")) {
          return new Response(
            JSON.stringify({
              teams: [
                {
                  id: "team_mock_123",
                  slug: "mock-team-dev",
                  name: "Mock Dev Team",
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const res = await verifyVercelToken("tok_team_12345");
      expect(res.valid).toBe(true);
      expect(res.username).toBe("dev_user");
      expect(res.teamId).toBe("team_mock_123");
      expect(res.teamSlug).toBe("mock-team-dev");
      expect(res.teamName).toBe("Mock Dev Team");
    });

    it("handles personal-scoped Vercel tokens with empty teams", async () => {
      const { verifyVercelToken } = await import("../vercel.js");
      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/v2/user")) {
          return new Response(JSON.stringify({ user: { username: "solo_dev" } }), { status: 200 });
        }
        if (urlStr.includes("/v2/teams")) {
          return new Response(JSON.stringify({ teams: [] }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const res = await verifyVercelToken("tok_personal_12345");
      expect(res.valid).toBe(true);
      expect(res.username).toBe("solo_dev");
      expect(res.teamId).toBeUndefined();
    });

    it("promotes a deployment to production using Vercel instant promote API", async () => {
      const { promoteDeployment } = await import("../vercel.js");
      let calledUrl = "";
      global.fetch = vi.fn(async (url: any) => {
        calledUrl = String(url);
        return new Response(JSON.stringify({ status: "PROMOTED" }), { status: 200 });
      }) as any;

      const res = await promoteDeployment("tok_abc", "dpl_xyz987", "team_mock_123");
      expect(res.success).toBe(true);
      expect(calledUrl).toContain("/v13/deployments/dpl_xyz987/promote?teamId=team_mock_123");
    });

    it("returns error details when promoteDeployment fails", async () => {
      const { promoteDeployment } = await import("../vercel.js");
      global.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: "Cannot promote inactive deployment" } }), {
          status: 400,
        });
      }) as any;

      const res = await promoteDeployment("tok_abc", "dpl_failed");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Cannot promote inactive deployment");
    });

    it("deployToVercel produces production URL and passes teamId to Vercel API", async () => {
      const { deployToVercel } = await import("../vercel.js");
      const calls: string[] = [];
      global.fetch = vi.fn(async (url: any, init: any) => {
        const urlStr = String(url);
        calls.push(urlStr);

        // Project lookup
        if (urlStr.includes("/v9/projects/test-proj-c3d4e5")) {
          return new Response(JSON.stringify({ id: "prj_test_123", name: "test-proj-c3d4e5" }), { status: 200 });
        }
        // Create deployment
        if (urlStr.includes("/v13/deployments") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              id: "dpl_new_456",
              projectId: "prj_test_123",
              url: "test-proj-c3d4e5-mock-team.vercel.app",
              alias: ["test-proj-c3d4e5.vercel.app"],
              readyState: "READY",
            }),
            { status: 200 }
          );
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const deployRes = await deployToVercel({
        token: "tok_test",
        projectName: "test-proj-c3d4e5",
        projectId: "prj_test_123",
        teamId: "team_mock_123",
        files: { "index.html": "<h1>Hello</h1>" },
      });

      expect(deployRes.status).toBe("READY");
      expect(deployRes.url).toBe("https://test-proj-c3d4e5.vercel.app");
      expect(deployRes.deploymentUrl).toBe("https://test-proj-c3d4e5-mock-team.vercel.app");
      expect(calls.some((c) => c.includes("teamId=team_mock_123"))).toBe(true);
    });
  });

  describe("Vercel Connection Errors & Token Revocation (Item 5)", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    const EXPIRED_MSG =
      "Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations.";

    it("handles recorded 401 response in verifyVercelToken with friendly error message", async () => {
      const { verifyVercelToken } = await import("../vercel.js");
      global.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Invalid token" } }), {
          status: 401,
        });
      }) as any;

      const res = await verifyVercelToken("tok_expired_401");
      expect(res.valid).toBe(false);
      expect(res.error).toBe(EXPIRED_MSG);
    });

    it("handles recorded 403 response in verifyVercelToken with friendly error message", async () => {
      const { verifyVercelToken } = await import("../vercel.js");
      global.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: { code: "forbidden", message: "Not authorized to access project. Invalid scope." } }),
          { status: 403 }
        );
      }) as any;

      const res = await verifyVercelToken("tok_revoked_403");
      expect(res.valid).toBe(false);
      expect(res.error).toBe(EXPIRED_MSG);
    });

    it("transforms raw 'Not authorized ... scope' 403 error in getOrCreateVercelProject into friendly reconnect message", async () => {
      const { getOrCreateVercelProject } = await import("../vercel.js");
      global.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: { code: "forbidden", message: "Not authorized to access project: invalid scope" } }),
          { status: 403 }
        );
      }) as any;

      await expect(
        getOrCreateVercelProject({
          token: "tok_revoked",
          projectName: "my-project-123",
        })
      ).rejects.toThrow(EXPIRED_MSG);
    });

    it("transforms recorded 401 in deployToVercel into friendly reconnect message", async () => {
      const { deployToVercel } = await import("../vercel.js");
      global.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes("/v9/projects")) {
          return new Response(JSON.stringify({ id: "prj_1", name: "my-project-123" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ error: { code: "unauthorized", message: "Token has expired or was revoked" } }),
          { status: 401 }
        );
      }) as any;

      await expect(
        deployToVercel({
          token: "tok_expired",
          projectName: "my-project-123",
          files: { "index.html": "<p>Test</p>" },
        })
      ).rejects.toThrow(EXPIRED_MSG);
    });

    it("transforms recorded 403 in addProjectDomain into friendly reconnect message", async () => {
      const { addProjectDomain } = await import("../vercel.js");
      global.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: { code: "forbidden", message: "Not authorized to access project" } }),
          { status: 403 }
        );
      }) as any;

      await expect(
        addProjectDomain("tok_revoked", "my-project-123", "example.com")
      ).rejects.toThrow(EXPIRED_MSG);
    });

    it("fails preflight with PUB_VERCEL_AUTH_EXPIRED and friendly message when token is expired", () => {
      const doc = createBlankDocument("Preflight Expired Test");
      const result = validatePreflight(doc, {
        hasVercelConnection: false,
        isVercelExpiredOrRevoked: true,
      });

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.code === "PUB_VERCEL_AUTH_EXPIRED")).toBe(true);
      expect(result.errors.some((e) => e.message === EXPIRED_MSG)).toBe(true);
    });
  });
});


