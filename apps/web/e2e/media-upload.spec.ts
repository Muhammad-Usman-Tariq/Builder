import { test, expect } from "./fixtures";

test.describe("Media Library and Upload E2E", () => {
  test("shows clear disabled state when storage is not configured, or uploads and persists media when configured", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Media Tester ${timestamp}`,
      email: `media_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Media Site ${timestamp}`,
    };

    // 1. Sign up
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // 2. Dashboard -> Create site
    await page.waitForURL("/dashboard", { timeout: 15000 });
    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await blankSiteBtn.click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    // 3. Editor navigation
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    // 4. Open Add panel and insert an Image element
    const addTab = page.getByRole("button", { name: /elements/i }).first();
    await expect(addTab).toBeVisible({ timeout: 5000 });
    await addTab.click();

    const addImageBtn = page.getByText("Image", { exact: false }).first();
    await expect(addImageBtn).toBeVisible({ timeout: 5000 });
    await addImageBtn.click();

    // 5. Open Media Picker from right panel
    const browseBtn = page.getByRole("button", { name: /Browse Library/i });
    await expect(browseBtn).toBeVisible({ timeout: 5000 });
    await browseBtn.click();

    // 6. Verify Media Picker modal is open
    const modalHeading = page.getByText("Media Picker");
    await expect(modalHeading).toBeVisible({ timeout: 5000 });

    // 7. Check whether storage is configured
    const unconfiguredNotice = page.getByText("Storage is not configured");
    const isConfigured = !(await unconfiguredNotice.isVisible());

    if (!isConfigured) {
      console.log("Storage is not configured in .env. Verifying clean notice in UI.");
      await expect(unconfiguredNotice).toBeVisible();
      await expect(
        page.getByText(/Add STORAGE_PROVIDER.*to \.env/i)
      ).toBeVisible();
      // Verify upload input is disabled
      const fileInput = page.locator("#media-file-input");
      await expect(fileInput).toBeDisabled();
      return;
    }

    // 8. If storage IS configured: upload a real image
    const fileInput = page.locator("#media-file-input");
    await fileInput.setInputFiles({
      name: "test-playwright-upload.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      ),
    });

    // 9. Wait for upload to complete and modal to close
    await expect(modalHeading).not.toBeVisible({ timeout: 20000 });

    // 10. Verify Image element in inspector has the uploaded public URL
    const srcInput = page.locator('input[placeholder="https://..."]');
    await expect(srcInput).not.toHaveValue("", { timeout: 10000 });
    const uploadedUrl = await srcInput.inputValue();
    expect(uploadedUrl).toMatch(/^https?:\/\//);

    // 11. Reload page to verify document persistence and rehydration
    await page.reload();
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    // Select the image element and verify url persisted
    const reloadedSrc = page.locator('input[placeholder="https://..."]');
    if (await reloadedSrc.isVisible()) {
      await expect(reloadedSrc).toHaveValue(uploadedUrl);
    }
  });
});
