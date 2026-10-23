import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { importFromUrl } from "../url.js";
import { validateUrlSsrf, isPrivateIPv4 } from "../ssrf.js";
import { checkRobotsTxt } from "../robots.js";

describe("Batch E3: URL Clone & SSRF Guard", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    // Spin up local HTTP fixture server
    server = http.createServer((req, res) => {
      if (req.url === "/robots.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("User-agent: *\nDisallow: /forbidden\nAllow: /\n");
        return;
      }

      if (req.url === "/forbidden") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Forbidden Page</h1>");
        return;
      }

      // Main rich fixture page
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fixture Landing Page</title>
            <style>
              body { margin: 0; font-family: sans-serif; background-color: #f8fafc; }
              .hero { padding: 40px; display: flex; flex-direction: column; gap: 16px; }
              h1 { font-size: 32px; color: #0f172a; margin: 0; }
              p { font-size: 16px; color: #475569; }
              .btn { background: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 6px; }
              
              /* CSS Grid Layout */
              .calculator-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                padding: 16px;
                background-color: #e2e8f0;
              }

              /* Background Image Banner */
              .banner {
                background-image: url('https://example.com/hero-bg.jpg');
                background-size: cover;
                background-position: center;
                padding: 24px;
                color: #ffffff;
              }

              /* Table Layout */
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px 12px; border: 1px solid #cbd5e1; }

              /* Fixed width container and fixed height button */
              .fixed-nav { width: 1200px; margin: 0 auto; padding: 16px; display: flex; justify-content: space-between; }
              .fixed-btn { height: 36px; padding: 8px 16px; background: #059669; color: #ffffff; }

              @media (max-width: 768px) {
                h1 { font-size: 24px; }
                .hero { padding: 20px; }
                .calculator-grid { grid-template-columns: 1fr; }
              }
            </style>
          </head>
          <body>
            <script>console.log("malicious_script_should_be_stripped");</script>
            <nav id="top-nav" class="fixed-nav">
              <span id="nav-brand">Brand Logo</span>
              <button id="seasonal-btn" class="fixed-btn">View Seasonal Menu</button>
            </nav>
            <div class="hero" id="hero-sec">
              <h1 id="main-heading">Welcome to the Future of Site Building</h1>
              <p id="main-desc">Create high-performance static websites directly in your browser.</p>
              <img id="main-img" src="https://example.com/demo.jpg" alt="Demo Illustration" width="400" height="200" />
              <button id="cta-btn" class="btn">Get Started Free</button>
            </div>

            <!-- CSS Background Image -->
            <div id="bg-banner" class="banner">
              <h2>High Performance Static Hosting</h2>
            </div>

            <!-- Inline SVG Icon -->
            <svg id="star-svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>

            <!-- CSS Grid with Buttons (Calculator Style) -->
            <div id="calc-grid" class="calculator-grid">
              <button class="calc-btn">1</button>
              <button class="calc-btn">2</button>
              <button class="calc-btn">3</button>
              <button class="calc-btn">4</button>
              <button class="calc-btn">5</button>
              <button class="calc-btn">6</button>
            </div>

            <!-- Table Layout -->
            <table id="pricing-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Free</td>
                  <td>$0/mo</td>
                </tr>
                <tr>
                  <td>Pro</td>
                  <td>$29/mo</td>
                </tr>
              </tbody>
            </table>

            <!-- Form Controls -->
            <form id="contact-form" action="/submit">
              <input type="text" name="name" placeholder="Full Name" />
              <textarea name="message" placeholder="Your Message"></textarea>
              <button type="submit">Submit Form</button>
            </form>

            <!-- Empty wrapper boxes that must be pruned -->
            <div class="empty-wrapper-1"></div>
            <div class="nested-empty-parent">
              <div class="nested-empty-child"></div>
            </div>

            <iframe src="https://evil.com/tracker"></iframe>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("SSRF Guard blocks private IP ranges and cloud metadata", async () => {
    // 1. Private IPv4 unit tests
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("10.0.0.5")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("192.168.1.100")).toBe(true);
    expect(isPrivateIPv4("169.254.169.254")).toBe(true); // AWS/GCP metadata
    expect(isPrivateIPv4("8.8.8.8")).toBe(false); // Google Public DNS
    expect(isPrivateIPv4("1.1.1.1")).toBe(false); // Cloudflare Public DNS

    // 2. URL verification without allowLocal
    const localRes = await validateUrlSsrf("http://127.0.0.1:8080/admin", { allowLocal: false });
    expect(localRes.valid).toBe(false);
    expect(localRes.error).toContain("forbidden");

    const metaRes = await validateUrlSsrf("http://169.254.169.254/latest/meta-data/", { allowLocal: false });
    expect(metaRes.valid).toBe(false);
  });

  it("Robots.txt checks disallow rule correctly", async () => {
    const allowed = await checkRobotsTxt(`${serverUrl}/`);
    expect(allowed.allowed).toBe(true);

    const disallowed = await checkRobotsTxt(`${serverUrl}/forbidden`);
    expect(disallowed.allowed).toBe(false);
    expect(disallowed.reason).toContain("disallowed by robots.txt");
  });

  it("Imports rich fixture page, preserves grid & table, imports CSS background images & SVGs, and prunes empty boxes", async () => {
    const result = await importFromUrl({
      url: `${serverUrl}/`,
      siteName: "Fixture Import",
      allowLocal: true,
    });

    expect(result.success).toBe(true);
    expect(result.document).toBeDefined();
    expect(result.report.imported).toBeGreaterThan(0);

    const doc = result.document;
    const elements = Object.values(doc.elements);

    // 1. Verify primitives mapped: Heading, Text, Image, Button
    const heading = elements.find((e) => e.type === "Heading");
    expect(heading).toBeDefined();
    expect(heading?.props["text"]).toContain("Welcome to the Future");

    const text = elements.find((e) => e.type === "Text" && String(e.props["text"]).includes("high-performance"));
    expect(text).toBeDefined();
    expect(text?.props["text"]).toContain("high-performance static websites");

    const img = elements.find((e) => e.type === "Image" && !String(e.props["src"] || "").startsWith("data:image/svg"));
    expect(img).toBeDefined();
    expect(img?.props["alt"]).toBe("Demo Illustration");

    // 2. Buttons stay Button elements
    const buttons = elements.filter((e) => e.type === "Button");
    expect(buttons.length).toBeGreaterThanOrEqual(7); // CTA + 6 calc buttons + submit
    expect(buttons.some((b) => b.props["text"] === "Get Started Free")).toBe(true);
    expect(buttons.some((b) => b.props["text"] === "1")).toBe(true);

    // 3. Inline SVG icon imported as Image/Icon element
    const svgIcon = elements.find((e) => e.type === "Image" && String(e.props["src"] || "").startsWith("data:image/svg"));
    expect(svgIcon).toBeDefined();

    // 4. CSS background image captured in styles
    const bgBannerElement = elements.find((e) => {
      const style = e.styleIds[0] ? doc.styles[e.styleIds[0]] : null;
      const desktop = style?.values?.desktop?.default;
      return desktop?.backgroundImage && "raw" in desktop.backgroundImage && desktop.backgroundImage.raw.includes("hero-bg.jpg");
    });
    expect(bgBannerElement).toBeDefined();

    // 5. CSS Grid preserved
    const gridElement = elements.find((e) => {
      const style = e.styleIds[0] ? doc.styles[e.styleIds[0]] : null;
      const desktop = style?.values?.desktop?.default;
      return (
        desktop?.display &&
        "keyword" in desktop.display &&
        desktop.display.keyword === "grid" &&
        desktop?.gridTemplateColumns !== undefined
      );
    });
    expect(gridElement).toBeDefined();

    // 6. Table converted into structured boxes
    const tableElement = elements.find((e) => {
      return elements.some((el) => el.parentId === e.id);
    });
    expect(tableElement).toBeDefined();

    // 7. Form controls captured
    const inputElement = elements.find((e) => e.type === "Input" && e.props["name"] === "name");
    expect(inputElement).toBeDefined();
    const textareaElement = elements.find((e) => e.type === "Textarea" && e.props["name"] === "message");
    expect(textareaElement).toBeDefined();

    // 8. No empty boxes! (Every Box element has children, text, or visual styling)
    const boxes = elements.filter((e) => e.type === "Box" && e.id !== doc.pages[Object.keys(doc.pages)[0]!]?.rootId);
    for (const b of boxes) {
      const hasChildren = b.children && b.children.length > 0;
      const hasText = b.props["text"] && String(b.props["text"]).trim().length > 0;
      const style = b.styleIds[0] ? doc.styles[b.styleIds[0]] : null;
      const desktop = style?.values?.desktop?.default;
      const hasBg = desktop?.backgroundColor || desktop?.backgroundImage;
      const hasBorder = desktop?.border || desktop?.borderWidth;
      expect(hasChildren || hasText || hasBg || hasBorder).toBeTruthy();
    }

    // 9. Verify scripts and iframes were dropped
    const scriptOrIframe = elements.find(
      (e) => e.type === "script" || e.type === "iframe" || JSON.stringify(e).includes("malicious_script")
    );
    expect(scriptOrIframe).toBeUndefined();

    // 10. Honest report counts
    expect(result.report.skipped).toBeGreaterThanOrEqual(2); // Script + Iframe
    expect(result.report.approximated).toBeGreaterThanOrEqual(1); // Converted layout (Grid / Table)
    expect(result.report.details).toBeDefined();
    expect(result.report.details?.convertedLayouts).toBeGreaterThanOrEqual(1);
    expect(result.report.details?.removedScripts).toBeGreaterThanOrEqual(1);
    expect(result.report.details?.unsupportedElements).toBeGreaterThanOrEqual(1);
    expect(result.report.details?.prunedEmptyBoxes).toBeGreaterThanOrEqual(1);

    // 11. Button text-overflow check: buttons use padding instead of fixed heights
    const seasonalBtn = elements.find((e) => e.props["text"] === "View Seasonal Menu");
    expect(seasonalBtn).toBeDefined();
    const btnStyle = seasonalBtn?.styleIds[0] ? doc.styles[seasonalBtn.styleIds[0]] : null;
    const btnDesktop = btnStyle?.values?.desktop?.default;
    // Button must NOT have a fixed height in style rules
    expect(btnDesktop?.height).toBeUndefined();
    // Button must use padding
    expect(btnDesktop?.padding).toBeDefined();
    expect(btnDesktop?.boxSizing).toEqual({ keyword: "border-box" });
    expect(btnDesktop?.maxWidth).toEqual({ value: 100, unit: "%" });

    // 12. Horizontal overflow check: fixed widths converted to max-width with width 100% and centered containers
    const navElement = elements.find(
      (e) => e.type === "Section" && elements.some((child) => child.parentId === e.id && child.id === seasonalBtn?.id)
    );
    expect(navElement).toBeDefined();
    const navStyle = navElement?.styleIds[0] ? doc.styles[navElement.styleIds[0]] : null;
    const navDesktop = navStyle?.values?.desktop?.default;
    expect(navDesktop?.width).toEqual({ value: 100, unit: "%" });
    expect(navDesktop?.maxWidth).toEqual({ value: 1200, unit: "px" });
    expect(navDesktop?.marginLeft).toEqual({ keyword: "auto" });
    expect(navDesktop?.marginRight).toEqual({ keyword: "auto" });

    // Verify all container elements across desktop, tablet, mobile do not have fixed px width causing overflow
    for (const el of elements) {
      const s = el.styleIds[0] ? doc.styles[el.styleIds[0]] : null;
      if (!s) continue;
      const d = s.values?.desktop?.default;
      const t = s.values?.tablet?.default;
      const m = s.values?.mobile?.default;

      if (["Body", "Section", "Box", "Form"].includes(el.type)) {
        // Containers must have width 100%
        if (d?.width) {
          expect(d.width).toEqual({ value: 100, unit: "%" });
        }
        // Tablet & mobile must not have fixed px width > screen width
        if (t?.width && "value" in t.width && t.width.unit === "px") {
          expect(t.width.value).toBeLessThanOrEqual(768);
        }
        if (m?.width && "value" in m.width && m.width.unit === "px") {
          expect(m.width.value).toBeLessThanOrEqual(375);
        }
      }
      if (el.type === "Button" || el.type === "Heading" || el.type === "Text") {
        // Buttons and text must never have fixed heights
        expect(d?.height).toBeUndefined();
        expect(t?.height).toBeUndefined();
        expect(m?.height).toBeUndefined();
      }
    }
  }, 15000);
});
