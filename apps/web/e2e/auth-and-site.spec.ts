import { test, expect } from "./fixtures";

test.describe("Auth and Site Lifecycle E2E", () => {
  test("signs up, creates a blank site, navigates to editor, reloads and retains document", async ({ page }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Tester ${timestamp}`,
      email: `tester_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Playwright Site ${timestamp}`,
    };

    // 1. Navigate to signup
    await page.goto("/signup");
    await expect(page).toHaveTitle(/Builder/i);

    // 2. Fill registration form
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);

    // 3. Submit registration
    await page.getByRole("button", { name: "Sign up" }).click();

    // 4. Verify redirect to dashboard
    await page.waitForURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Websites", exact: true })).toBeVisible({ timeout: 15000 });

    // 5. Open Create Site modal (either from top button or empty state button)
    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await expect(blankSiteBtn).toBeVisible();
    await blankSiteBtn.click();

    // 6. Enter site name and submit
    await expect(page.getByRole("heading", { name: "Create a new website" })).toBeVisible();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    // 7. Verify navigation into Editor
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    
    // 8. Verify editor UI loaded with site name and default home page
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("combobox").first()).toHaveValue(/^page[-_]/);

    // 9. Reload page to verify document persistence and rehydration
    await page.reload();

    // 10. Verify editor state reloads cleanly
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("combobox").first()).toHaveValue(/^page[-_]/);
  });
});
