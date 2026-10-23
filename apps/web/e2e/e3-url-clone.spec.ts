import { test, expect } from "./fixtures";
import http from "node:http";
import { createWorker } from "@builder/jobs/worker";

test.describe("E3: URL Clone Lifecycle E2E", () => {
  let server: http.Server;
  let testUrl: string;
  let worker: ReturnType<typeof createWorker>;

  test.beforeAll(async () => {
    worker = createWorker();

    // 1. Host local HTML page on an ephemeral port
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Artisan Bakery Test Page</title>
</head>
<body style="margin:0;font-family:sans-serif;background-color:#ffffff;">
  <header style="background-color:#171717;color:#ffffff;padding:24px;">
    <h1 style="font-size:28px;margin:0;">Artisan Sourdough Bakery</h1>
    <p style="color:#a3a3a3;margin-top:8px;">Handcrafted breads baked fresh daily with organic yeast.</p>
  </header>
  <main style="padding:32px;">
    <section>
      <h2 style="font-size:20px;color:#171717;">Daily Hearth Batches</h2>
      <p style="color:#525252;line-height:1.5;">Crispy golden crust with tender crumb, baked every dawn.</p>
      <button style="padding:10px 20px;background-color:#2563eb;color:#ffffff;border:none;border-radius:6px;cursor:pointer;">
        Order Fresh Loaf
      </button>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px;">
        <button style="padding:8px;background:#e5e7eb;">Baguette</button>
        <button style="padding:8px;background:#e5e7eb;">Ciabatta</button>
      </div>
      <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>
    </section>
  </main>
</body>
</html>`);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          testUrl = `http://127.0.0.1:${addr.port}/`;
        }
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (worker) {
      await worker.close(true);
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("imports website from local URL, displays progress, opens editor, and verifies import report", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `UrlClone Tester ${timestamp}`,
      email: `urlclone_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Cloned Bakery ${timestamp}`,
    };

    // 1. Sign up
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // 2. Arrive at Dashboard
    await page.waitForURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Websites", exact: true })).toBeVisible({
      timeout: 15000,
    });

    // 3. Open "Import from website" modal
    const importBtn = page.getByRole("button", { name: /Import from website/i }).first();
    await expect(importBtn).toBeVisible({ timeout: 10000 });
    await importBtn.click();

    // Modal is mounted
    await expect(page.getByRole("heading", { name: "Import from Website" })).toBeVisible({
      timeout: 5000,
    });

    // 4. Fill form: URL, Site Name, and Rights confirmation
    const urlInput = page.getByTestId("import-url-input");
    await expect(urlInput).toBeVisible();
    await urlInput.fill(testUrl);

    const siteNameInput = page.getByPlaceholder("e.g. My Cloned Landing Page");
    await siteNameInput.fill(testUser.siteName);

    const rightsCheckbox = page.getByTestId("rights-confirmation-checkbox");
    await rightsCheckbox.check();

    // 5. Submit import
    const submitBtn = page.getByTestId("submit-import-btn");
    await submitBtn.click();

    // 6. Verify job progress indicator appears
    await expect(
      page.getByText(/Importing|Connecting|Scraping|Verifying/i).first()
    ).toBeVisible({ timeout: 10000 });

    // 7. Verify import completes and Import Report card is displayed
    const reportCard = page.getByTestId("import-report-card");
    await expect(reportCard).toBeVisible({ timeout: 35000 });
    await expect(page.getByText("Import Succeeded!")).toBeVisible();
    await expect(page.getByText("Import Report")).toBeVisible();
    await expect(page.getByText("Imported", { exact: true })).toBeVisible();

    // Verify expandable details section is present
    const detailsEl = page.getByTestId("import-report-details");
    await expect(detailsEl).toBeVisible();

    // 8. Click "Open in Editor →"
    const openEditorBtn = page.getByTestId("open-imported-editor-btn");
    await expect(openEditorBtn).toBeVisible();
    await openEditorBtn.click();

    // 9. Editor opens with the imported site
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    // 10. Verify Import Report banner is visible in the editor
    const reportBanner = page.getByTestId("import-report-banner");
    await expect(reportBanner).toBeVisible({ timeout: 10000 });
    await expect(reportBanner).toContainText("Import Report:");

    // 11. Verify Canvas iframe loads the imported site content
    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 15000 });
    await expect(
      canvasFrame.getByText("Artisan Sourdough Bakery", { exact: false })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      canvasFrame.getByText("Baguette", { exact: false })
    ).toBeVisible({ timeout: 15000 });
  });
});
