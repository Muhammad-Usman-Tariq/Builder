import { test, expect } from "./fixtures";

test.describe("Publish & Custom Domains Flow (Batch B)", () => {
  test("Publish modal shows domain gating when unpublished, button states, and tabs", async ({
    page,
  }) => {
    const timestamp = Date.now();
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(`Publish User ${timestamp}`);
    await page.getByPlaceholder("jane@example.com").fill(`pub_${timestamp}@example.com`);
    await page.getByPlaceholder("••••••••").fill("Password123!");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForURL("/dashboard", { timeout: 15000 });

    // Create a new blank site
    const blankBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await blankBtn.click();
    await page.getByPlaceholder("My Awesome Website").fill(`Publish Test Site ${timestamp}`);
    await page.getByRole("button", { name: "Create Website" }).click();

    await page.waitForURL(/\/editor\/(site_[a-zA-Z0-9_-]+)/, { timeout: 15000 });
    const match = page.url().match(/\/editor\/(site_[a-zA-Z0-9_-]+)/);
    const siteId = match ? match[1] : null;
    expect(siteId).not.toBeNull();

    // Open Publish Modal via Top Bar
    const publishBtn = page.getByRole("button", { name: /Publish/i }).first();
    await expect(publishBtn).toBeVisible({ timeout: 10000 });
    await publishBtn.click();

    // Verify modal header
    await expect(page.getByRole("heading", { name: "Publish to Vercel" })).toBeVisible({ timeout: 5000 });

    // 1. Check Custom Domain tab when site is unpublished
    const domainTabBtn = page.getByRole("button", { name: "Custom Domain" });
    await domainTabBtn.click();

    // Assert requirement B.1: "Publish the site first to connect a domain"
    await expect(
      page.getByText(/Publish the site first to connect a domain/i)
    ).toBeVisible({ timeout: 5000 });

    // Click "Go to Publish tab"
    const goToPublishBtn = page.getByRole("button", { name: "Go to Publish tab" });
    await expect(goToPublishBtn).toBeVisible();
    await goToPublishBtn.click();

    // 2. Assert requirement B.3: Never published -> "Publish site"
    const publishSiteBtn = page.getByRole("button", { name: /Publish site/i });
    await expect(publishSiteBtn).toBeVisible({ timeout: 5000 });

    // 3. Check Deployments & Rollback tab
    const deploymentsTabBtn = page.getByRole("button", { name: "Deployments & Rollback" });
    await deploymentsTabBtn.click();

    // Assert requirement B.4: "Show failed" toggle exists
    await expect(page.getByText("Show failed")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Deployment History")).toBeVisible();
  });
});
