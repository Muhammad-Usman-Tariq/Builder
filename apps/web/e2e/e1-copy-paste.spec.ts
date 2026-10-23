import { test, expect } from "./fixtures";

test.describe("E1: Copy / Paste Subtree Lifecycle E2E", () => {
  test("copies a section with children, pastes on another page, tests undo, redo, and reloads", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `CopyPaste Tester ${timestamp}`,
      email: `copypaste_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `CopyPaste Site ${timestamp}`,
    };

    // 1. Sign up
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // 2. Create blank website
    await page.waitForURL("/dashboard", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Websites", exact: true })).toBeVisible({ timeout: 15000 });

    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await expect(blankSiteBtn).toBeVisible({ timeout: 10000 });
    await blankSiteBtn.click();

    await expect(page.getByRole("heading", { name: "Create a new website" })).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    // 3. Navigate into editor and verify iframe canvas is mounted
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 4. Open "elements" Add panel tab
    const addTab = page.getByTestId("tab-elements");
    await expect(addTab).toBeVisible({ timeout: 5000 });
    await addTab.click();

    // 5. Insert Section primitive
    const sectionBtn = page.getByText("Section", { exact: false }).first();
    await expect(sectionBtn).toBeVisible({ timeout: 5000 });
    await sectionBtn.click();

    // 6. Insert Heading primitive inside the Section
    const headingBtn = page.getByText("Heading", { exact: false }).first();
    await expect(headingBtn).toBeVisible({ timeout: 5000 });
    await headingBtn.click();

    // Verify heading appears inside the canvas
    const headingOnCanvas = canvasFrame.locator("h2, h1, h3").first();
    await expect(headingOnCanvas).toBeVisible({ timeout: 10000 });

    // 7. Select Section in the layers tree
    await page.getByTestId("tab-layers").click();
    const sectionLayer = page.locator("aside").getByText("Section", { exact: true }).first();
    await expect(sectionLayer).toBeVisible({ timeout: 5000 });
    await sectionLayer.click();

    // 8. Copy with keyboard shortcut on page A (Section D.5)
    await page.keyboard.press("Control+c");

    // 9. Switch to pages tab and open Create Page dialog
    await page.getByTestId("tab-pages").click();
    const addPageBtn = page.getByRole("button", { name: /\+ Add Page/i });
    await expect(addPageBtn).toBeVisible({ timeout: 5000 });
    await addPageBtn.click();

    await expect(page.getByText("+ New Page")).toBeVisible({ timeout: 5000 });
    await page.getByText("+ New Page").click();

    // Fill new page details
    await page.getByPlaceholder("e.g. About, Pricing, Contact").fill("About");
    await page.getByPlaceholder("/about").fill("/about");
    await page.getByRole("button", { name: "Create Page" }).click();

    // 10. Switch to the newly created About page via Page Selector
    const pageSelect = page.getByRole("combobox").first();
    await pageSelect.selectOption({ label: "About (/about)" });

    // Verify canvas rehydrates for About page
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 5000 });
    await canvasFrame.locator("#canvas-root").click();

    // 11. Paste on the About page using keyboard shortcut Ctrl+V
    await page.keyboard.press("Control+v");

    // Verify pasted heading appears on About page
    const pastedHeading = canvasFrame.locator("h2, h1, h3").first();
    await expect(pastedHeading).toBeVisible({ timeout: 10000 });

    // 12. Test Undo: Click Undo button
    const undoBtn = page.locator('button[title*="Undo"]');
    await expect(undoBtn).toBeEnabled({ timeout: 5000 });
    await undoBtn.click();

    // Verify heading is gone after Undo
    await expect(pastedHeading).not.toBeVisible({ timeout: 5000 });

    // 13. Test Redo: Click Redo button
    const redoBtn = page.locator('button[title*="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();

    // Verify heading reappears after Redo
    await expect(canvasFrame.locator("h2, h1, h3").first()).toBeVisible({ timeout: 5000 });

    // 14. Wait for Autosave
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    // 15. Reload page to verify persistence across sessions
    await page.reload();

    // Verify editor reloads and pasted content is still intact
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });
    const reloadedCanvas = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(reloadedCanvas.locator("h2, h1, h3").first()).toBeVisible({ timeout: 10000 });
  });
});
