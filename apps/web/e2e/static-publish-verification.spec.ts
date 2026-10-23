import { test, expect } from "./fixtures";
import * as http from "node:http";
import { buildStaticSite } from "@builder/publish/builder";
import type { SiteDocument } from "@builder/document";

test.describe("Published Static Output Local Verification", () => {
  let server: http.Server;
  let serverPort: number;
  let staticFiles: Record<string, string | Buffer>;

  test.beforeAll(async () => {
    // Construct a sample site document with token font Cormorant Garamond,
    // Guarantee card components with text and icons, and a valid image.
    const doc: SiteDocument = {
      schemaVersion: 1,
      site: {
        name: "Bloom & Petal",
        defaultLocale: "en",
        locales: ["en"],
      },
      breakpoints: [
        { id: "desktop", name: "Desktop", minWidth: 1024 },
        { id: "mobile", name: "Mobile", minWidth: 0, maxWidth: 1023 },
      ],
      tokens: {
        colors: {
          "color.primary": "#1f2937",
          "color.secondary": "#4b5563",
          "color.background": "#ffffff",
          "color.surface": "#f9fafb",
          "color.text": "#111827",
          "color.muted": "#9ca3af",
          "color.border": "#e5e7eb",
          "color.accent": "#f43f5e",
        },
        fonts: {
          heading: "Cormorant Garamond",
          body: "Inter",
        },
        spacing: {
          "space.base": 8,
        },
        radius: {
          "radius.base": 8,
        },
        shadows: {},
      },
      elements: {
        body_1: {
          id: "body_1",
          type: "Body",
          name: "Body",
          parentId: null,
          children: ["sec_hero", "sec_guarantee"],
          styleIds: ["st_body"],
          props: {},
        },
        sec_hero: {
          id: "sec_hero",
          type: "Section",
          name: "Hero Section",
          parentId: "body_1",
          children: ["heading_hero", "img_hero"],
          styleIds: [],
          props: {},
        },
        heading_hero: {
          id: "heading_hero",
          type: "Heading",
          name: "Hero Heading",
          parentId: "sec_hero",
          children: [],
          styleIds: ["st_heading"],
          props: { text: "Artisanal Floristry at its Finest", level: 1 },
        },
        img_hero: {
          id: "img_hero",
          type: "Image",
          name: "Hero Image",
          parentId: "sec_hero",
          children: [],
          styleIds: [],
          props: {
            src: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800",
            alt: "Artisan florist shop flowers",
          },
        },
        sec_guarantee: {
          id: "sec_guarantee",
          type: "Section",
          name: "Guarantee Section",
          parentId: "body_1",
          children: ["card_1", "card_2"],
          styleIds: [],
          props: {},
        },
        card_1: {
          id: "card_1",
          type: "Box",
          name: "The Maison Guarantee Card 1",
          parentId: "sec_guarantee",
          children: ["icon_1", "title_1", "desc_1"],
          styleIds: ["st_card"],
          props: {},
        },
        icon_1: {
          id: "icon_1",
          type: "Icon",
          name: "Card 1 Icon",
          parentId: "card_1",
          children: [],
          styleIds: [],
          props: { name: "shield-check" },
        },
        title_1: {
          id: "title_1",
          type: "Heading",
          name: "Card 1 Title",
          parentId: "card_1",
          children: [],
          styleIds: [],
          props: { text: "100% Freshness Guaranteed", level: 3 },
        },
        desc_1: {
          id: "desc_1",
          type: "Text",
          name: "Card 1 Description",
          parentId: "card_1",
          children: [],
          styleIds: [],
          props: { text: "Hand-picked daily from sustainable local growers." },
        },
        card_2: {
          id: "card_2",
          type: "Box",
          name: "The Maison Guarantee Card 2",
          parentId: "sec_guarantee",
          children: ["icon_2", "title_2", "desc_2"],
          styleIds: ["st_card"],
          props: {},
        },
        icon_2: {
          id: "icon_2",
          type: "Icon",
          name: "Card 2 Icon",
          parentId: "card_2",
          children: [],
          styleIds: [],
          props: { name: "truck" },
        },
        title_2: {
          id: "title_2",
          type: "Heading",
          name: "Card 2 Title",
          parentId: "card_2",
          children: [],
          styleIds: [],
          props: { text: "Same-Day Delivery", level: 3 },
        },
        desc_2: {
          id: "desc_2",
          type: "Text",
          name: "Card 2 Description",
          parentId: "card_2",
          children: [],
          styleIds: [],
          props: { text: "Delivered in temperature-controlled bespoke packaging." },
        },
      },
      styles: {
        st_body: {
          id: "st_body",
          name: "Body Style",
          kind: "local",
          values: {
            desktop: {
              default: {
                backgroundColor: { token: "color.background" },
                color: { token: "color.text" },
                fontFamily: { raw: "Inter, sans-serif" },
              },
            },
          },
        },
        st_heading: {
          id: "st_heading",
          name: "Heading Style",
          kind: "local",
          values: {
            desktop: {
              default: {
                fontFamily: { token: "heading" },
                fontSize: { unit: "px", value: 36 },
              },
            },
          },
        },
        st_card: {
          id: "st_card",
          name: "Card Style",
          kind: "local",
          values: {
            desktop: {
              default: {
                backgroundColor: { token: "color.surface" },
                padding: { unit: "px", value: 24 },
                border: { raw: "1px solid #e5e7eb" },
              },
            },
          },
        },
      },
      pages: {
        pg_1: {
          id: "pg_1",
          name: "Home",
          slug: "/",
          rootId: "body_1",
          seo: { title: "Bloom & Petal | Artisanal Florist" },
          status: "published",
        },
      },
      components: {},
      assets: {},
    };

    const buildResult = buildStaticSite(doc, {
      siteId: "test_site_static",
    });

    staticFiles = buildResult.files;

    // Start a temporary local HTTP server on an available port (not 3000)
    server = http.createServer((req, res) => {
      let reqPath = req.url?.split("?")[0] || "/";
      if (reqPath === "/" || reqPath === "") reqPath = "/index.html";
      const cleanKey = reqPath.startsWith("/") ? reqPath.slice(1) : reqPath;

      const fileContent = staticFiles[cleanKey];
      if (fileContent !== undefined) {
        if (cleanKey.endsWith(".html")) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
        } else if (cleanKey.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
        } else if (cleanKey.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript");
        } else if (cleanKey.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json");
        }
        res.writeHead(200);
        res.end(fileContent);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise<void>((resolve) => {
      // Listen on random free port (port 0)
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("published static HTML contains Google Fonts link, loaded fonts, card contents, and working images", async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${serverPort}/`);

    // 1. Verify Google Font <link> tag for Cormorant Garamond is present in published HTML head
    const fontLink = page.locator('link[href*="family=Cormorant+Garamond"]').first();
    await expect(fontLink).toBeAttached();
    const fontHref = await fontLink.getAttribute("href");
    expect(fontHref).toContain("family=Cormorant+Garamond");
    expect(fontHref).toContain("display=swap");

    // 2. Verify token font is loaded by the browser engine (document.fonts)
    await page.evaluate(async () => {
      await document.fonts.ready;
      await document.fonts.load('16px "Cormorant Garamond"');
    });
    const isFontLoaded = await page.evaluate(async () => {
      return document.fonts.check('16px "Cormorant Garamond"');
    });
    expect(isFontLoaded).toBe(true);

    // 3. Verify images render and load with naturalWidth > 0
    const imgLocator = page.locator("img").first();
    await expect(imgLocator).toBeVisible();
    const naturalWidth = await imgLocator.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);

    // 4. Verify card content inside Guarantee cards renders text and icon elements
    await expect(page.getByText("100% Freshness Guaranteed")).toBeVisible();
    await expect(page.getByText("Hand-picked daily from sustainable local growers.")).toBeVisible();
    await expect(page.getByText("Same-Day Delivery")).toBeVisible();
    await expect(page.getByText("Delivered in temperature-controlled bespoke packaging.")).toBeVisible();

    // Verify icons inside cards are present
    const cardIcons = page.locator('svg[data-icon="shield-check"], svg[data-icon="truck"], svg');
    expect(await cardIcons.count()).toBeGreaterThanOrEqual(2);
  });
});
