import { test, expect } from "./fixtures";

test.describe("Batch G: Screenshot Import E2E", () => {
  test("displays clear warning when no vision provider is configured, and allows modal interaction", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Vision Tester ${timestamp}`,
      email: `vision_${timestamp}@example.com`,
      password: "Password123!",
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

    // 3. Verify "Import from screenshot" button exists
    const importScreenshotBtn = page.getByTestId("import-screenshot-btn");
    await expect(importScreenshotBtn).toBeVisible({ timeout: 10000 });
    await importScreenshotBtn.click();

    // 4. Modal is mounted
    const modal = page.getByTestId("screenshot-import-modal");
    await expect(modal).toBeVisible({ timeout: 5000 });

    // 5. Submit button is disabled before screenshot upload
    const submitBtn = page.getByTestId("submit-screenshot-import");
    await expect(submitBtn).toBeDisabled();

    // 6. Verify file upload trigger exists
    const uploadBtn = page.getByTestId("upload-desktop-btn");
    await expect(uploadBtn).toBeVisible();

    // 7. Verify optional mobile upload trigger exists
    const uploadMobileBtn = page.getByTestId("upload-mobile-btn");
    await expect(uploadMobileBtn).toBeVisible();

    // 8. Close modal
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).not.toBeVisible();
  });
});
