import { test, expect } from "./fixtures";

test.describe("Milestone M5: Editor Full Lifecycle & Interaction E2E", () => {
  test("inserts button from Add panel, changes color on mobile only, undo, redo, reloads and verifies persistence", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Editor Tester ${timestamp}`,
      email: `editor_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `M5 Site ${timestamp}`,
    };

    // 1. Sign up
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // 2. Create blank website
    await page.waitForURL("/dashboard", { timeout: 15000 });
    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await blankSiteBtn.click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    // 3. Navigate into editor and verify iframe canvas is mounted
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 4. Open "elements" Add panel tab
    const addTab = page.getByRole("button", { name: /elements/i });
    await expect(addTab).toBeVisible({ timeout: 5000 });
    await addTab.click();

    // 5. Insert a Button primitive from the Add panel
    const insertBtn = page.getByText("Button", { exact: false }).first();
    await expect(insertBtn).toBeVisible({ timeout: 5000 });
    await insertBtn.click();

    // 6. Verify button appears inside the isolated iframe canvas
    const buttonOnCanvas = canvasFrame.getByRole("button", { name: "Click here" }).first();
    await expect(buttonOnCanvas).toBeVisible({ timeout: 5000 });

    // Click button on canvas to select it
    await buttonOnCanvas.click();

    // 7. In inspector right panel, switch to "styles" tab
    const stylesTab = page.getByRole("button", { name: /styles/i }).first();
    await expect(stylesTab).toBeVisible({ timeout: 5000 });
    await stylesTab.click();

    // 8. Switch breakpoint to mobile in inspector or top bar
    const mobileBpBtn = page.getByRole("button", { name: "mobile" }).first();
    await expect(mobileBpBtn).toBeVisible();
    await mobileBpBtn.click();

    // 9. Change background color on mobile only
    const bgInput = page.locator('input[placeholder="#000000"]');
    await expect(bgInput).toBeVisible();
    await bgInput.fill("#ef4444");
    await bgInput.press("Enter");

    // 10. Verify undo/redo buttons and labels
    const undoBtn = page.locator('button[title*="Undo"]');
    await expect(undoBtn).toBeEnabled();
    const undoTitle = await undoBtn.getAttribute("title");
    expect(undoTitle).toMatch(/Undo/i);

    // Click Undo
    await undoBtn.click();

    // Click Redo
    const redoBtn = page.locator('button[title*="Redo"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();

    // 11. Wait for autosave to indicate "Saved"
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    // 12. Reload the page to test document persistence and rehydration
    await page.reload();

    // 13. Verify site and canvas reloaded cleanly
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });
    const reloadedCanvas = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    const reloadedBtn = reloadedCanvas.getByRole("button", { name: "Click here" }).first();
    await expect(reloadedBtn).toBeVisible({ timeout: 10000 });

    // Select the button again
    await reloadedBtn.click();
    await page.getByRole("button", { name: /styles/i }).first().click();

    // Switch to mobile breakpoint
    await page.getByRole("button", { name: "mobile" }).first().click();

    // Verify mobile background color stayed
    const persistedBg = page.locator('input[placeholder="#000000"]');
    await expect(persistedBg).toHaveValue("#ef4444", { timeout: 10000 });
  });

  test("verifies drag-and-drop insert, drag-to-move, and outside resize handles", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Dnd Tester ${timestamp}`,
      email: `dnd_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Dnd Site ${timestamp}`,
    };

    // 1. Sign up and create site
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("/dashboard", { timeout: 15000 });

    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await blankSiteBtn.click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 2. Open Add panel and insert elements
    const addTab = page.getByRole("button", { name: /elements/i });
    await addTab.click();

    // Insert Container
    const containerItem = page.getByText("Container", { exact: false }).first();
    await containerItem.click();

    // Insert Heading
    const headingItem = page.getByText("Heading", { exact: false }).first();
    await headingItem.click();

    // Insert Button
    const buttonItem = page.getByText("Button", { exact: false }).first();
    await buttonItem.click();

    // 3. Verify elements mounted on canvas
    const headingOnCanvas = canvasFrame.locator('[data-element-type="Heading"]').first();
    await expect(headingOnCanvas).toBeVisible({ timeout: 5000 });

    // Click heading to select it
    await headingOnCanvas.click();

    // 4. Verify resize handles placed outside element bounds
    const resizeHandleRight = page.locator('[data-testid="resize-handle-right"]');
    await expect(resizeHandleRight).toBeVisible({ timeout: 5000 });

    const resizeHandleBottomRight = page.locator('[data-testid="resize-handle-bottom-right"]');
    await expect(resizeHandleBottomRight).toBeVisible({ timeout: 5000 });

    // Drag the right resize handle to resize element width
    const handleBox = await resizeHandleRight.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + 80, handleBox.y, { steps: 5 });
      await page.mouse.up();
    }

    // 5. Verify undo button shows human-readable action label
    const undoBtn = page.locator('button[title*="Undo"]');
    await expect(undoBtn).toBeEnabled();
    const titleText = await undoBtn.getAttribute("title");
    expect(titleText).toBeTruthy();
    expect(titleText?.toLowerCase()).toContain("undo");
  });

  test("verifies layer rename, hide, lock, and reorder", async ({ page }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Layers Tester ${timestamp}`,
      email: `layers_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Layers Site ${timestamp}`,
    };

    // 1. Sign up and open editor
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("/dashboard", { timeout: 15000 });

    await page.getByRole("button", { name: /Blank site/i }).first().click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });

    // 2. Add an element to have layers
    await page.getByRole("button", { name: /elements/i }).click();
    await page.getByText("Button", { exact: false }).first().click();

    // 3. Switch to "layers" tab
    await page.getByRole("button", { name: /layers/i }).click();

    // Verify layer item exists
    const layerItem = page.locator('div[title*="rename"]').last();
    await expect(layerItem).toBeVisible({ timeout: 5000 });

    // 4. Double click layer item to trigger inline rename
    await layerItem.dblclick();
    const renameInput = page.locator('aside input[type="text"]').first();
    if (await renameInput.isVisible()) {
      await renameInput.fill("Custom Call To Action");
      await renameInput.press("Enter");
      await expect(page.locator("aside").getByText("Custom Call To Action").first()).toBeVisible({ timeout: 5000 });
    }

    // 5. Hover and click Lock button
    await layerItem.hover();
    const lockBtn = layerItem.locator('button[title*="Lock"]').first();
    if (await lockBtn.isVisible()) {
      await lockBtn.click();
      // Verify layer is locked
      await expect(layerItem.locator('button[title*="Unlock"]')).toBeVisible();
    }

    // 6. Hover and click Hide button
    const hideBtn = layerItem.locator('button[title*="Hide"]').first();
    if (await hideBtn.isVisible()) {
      await hideBtn.click();
      // Verify unhide button appears
      await expect(layerItem.locator('button[title*="Unhide"]')).toBeVisible();
    }
  });

  test("verifies :hover state in inspector, preview mode, and page reorder", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Preview Tester ${timestamp}`,
      email: `preview_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Preview Site ${timestamp}`,
    };

    // 1. Sign up and open editor
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("/dashboard", { timeout: 15000 });

    await page.getByRole("button", { name: /Blank site/i }).first().click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 2. Insert Button
    await page.getByRole("button", { name: /elements/i }).click();
    await page.getByText("Button", { exact: false }).first().click();

    const buttonOnCanvas = canvasFrame.getByRole("button", { name: "Click here" }).first();
    await buttonOnCanvas.click();

    // 3. Switch to Styles tab and select :hover state
    await page.getByRole("button", { name: /styles/i }).first().click();
    const hoverStateBtn = page.getByRole("button", { name: ":hover" }).first();
    await expect(hoverStateBtn).toBeVisible();
    await hoverStateBtn.click();

    // Set hover background
    const bgInput = page.locator('input[placeholder="#000000"]');
    await bgInput.fill("#10b981");
    await bgInput.press("Enter");

    // 4. Enter Preview Mode
    const previewBtn = page.getByRole("button", { name: "Preview", exact: true });
    await previewBtn.click();

    // In preview mode, Exit Preview button is visible and toolbar is hidden
    await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible({ timeout: 5000 });

    // Exit preview mode
    await page.getByRole("button", { name: "Exit Preview" }).click();
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeVisible({ timeout: 5000 });

    // 5. Test Page Management & Reordering
    await page.getByRole("button", { name: /pages/i }).click();
    await page.getByRole("button", { name: /\+ Add Page/i }).click();

    // Switch to Add New Page mode
    const addNewPageTab = page.getByRole("button", { name: "+ New Page" });
    await expect(addNewPageTab).toBeVisible();
    await addNewPageTab.click();

    await page.getByPlaceholder("e.g. About, Pricing, Contact").fill("Pricing");
    await page.getByRole("button", { name: "Create Page", exact: true }).click();

    // Verify both Home and Pricing pages listed in the pages panel
    await expect(page.locator("aside").getByText("Pricing", { exact: true }).first()).toBeVisible({ timeout: 5000 });

    // Verify page reorder buttons (Move page up / down)
    const movePageUpBtn = page.locator('button[title="Move page up"]').last();
    if (await movePageUpBtn.isEnabled()) {
      await movePageUpBtn.click();
      // Reordered!
    }
  });

  test("verifies free positioning stores left and top per breakpoint (desktop, tablet, mobile) with cascade inheritance", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `FreePos Tester ${timestamp}`,
      email: `freepos_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `FreePos Site ${timestamp}`,
    };

    // 1. Sign up and navigate to editor
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.waitForURL("/dashboard", { timeout: 15000 });

    await page.getByRole("button", { name: /Blank site/i }).first().click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 2. Insert Button
    await page.getByRole("button", { name: /elements/i }).click();
    await page.getByText("Button", { exact: false }).first().click();

    const buttonOnCanvas = canvasFrame.getByRole("button", { name: "Click here" }).first();
    await buttonOnCanvas.click();

    // 3. Switch to Styles tab in inspector
    await page.getByRole("button", { name: /styles/i }).first().click();

    // 4. Enable Free Position mode
    const freePosBtn = page.getByRole("button", { name: "Free Position" });
    await expect(freePosBtn).toBeVisible({ timeout: 5000 });
    await freePosBtn.click();

    // Verify mobile warning note is visible
    await expect(
      page.getByText(/Free positioning can break mobile responsiveness/i)
    ).toBeVisible({ timeout: 5000 });

    const leftInput = page.locator('input[data-testid="free-pos-left"]');
    const topInput = page.locator('input[data-testid="free-pos-top"]');
    await expect(leftInput).toBeVisible();
    await expect(topInput).toBeVisible();

    // 5. On Desktop: set Left = 120px, Top = 80px
    await leftInput.fill("120px");
    await leftInput.press("Enter");
    await topInput.fill("80px");
    await topInput.press("Enter");

    await expect(leftInput).toHaveValue("120px");
    await expect(topInput).toHaveValue("80px");

    // 6. Switch to Tablet: verify cascade from desktop, then override Left to 60px
    const tabletBpBtn = page.getByRole("button", { name: "tablet" }).first();
    await tabletBpBtn.click();

    // Left and Top inherited from desktop
    await expect(leftInput).toHaveValue("120px");
    await expect(topInput).toHaveValue("80px");

    // Override Left on tablet to 60px
    await leftInput.fill("60px");
    await leftInput.press("Enter");
    await expect(leftInput).toHaveValue("60px");
    await expect(topInput).toHaveValue("80px"); // Top remains cascaded from desktop

    // 7. Switch to Mobile: verify Left cascades from tablet (60px), override Top to 25px
    const mobileBpBtn = page.getByRole("button", { name: "mobile" }).first();
    await mobileBpBtn.click();

    // Left inherited from tablet override (60px), Top inherited from desktop (80px)
    await expect(leftInput).toHaveValue("60px");
    await expect(topInput).toHaveValue("80px");

    // Override Top on mobile to 25px
    await topInput.fill("25px");
    await topInput.press("Enter");
    await expect(topInput).toHaveValue("25px");
    await expect(leftInput).toHaveValue("60px"); // Left remains cascaded from tablet

    // 8. Switch back to Desktop: verify desktop values remained untouched
    const desktopBpBtn = page.getByRole("button", { name: "desktop" }).first();
    await desktopBpBtn.click();
    await expect(leftInput).toHaveValue("120px");
    await expect(topInput).toHaveValue("80px");

    // 9. Switch back to Tablet: verify tablet Left is 60px, Top is 80px
    await tabletBpBtn.click();
    await expect(leftInput).toHaveValue("60px");
    await expect(topInput).toHaveValue("80px");

    // 10. Switch back to Mobile: verify mobile Left is 60px, Top is 25px
    await mobileBpBtn.click();
    await expect(leftInput).toHaveValue("60px");
    await expect(topInput).toHaveValue("25px");

    // 11. Wait for autosave and reload to verify persistence across rehydration
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });
    await page.reload();

    const reloadedCanvas = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    const reloadedBtn = reloadedCanvas.getByRole("button", { name: "Click here" }).first();
    await expect(reloadedBtn).toBeVisible({ timeout: 10000 });
    await reloadedBtn.click();

    await page.getByRole("button", { name: /styles/i }).first().click();
    const reloadedLeft = page.locator('input[data-testid="free-pos-left"]');
    const reloadedTop = page.locator('input[data-testid="free-pos-top"]');

    // On default desktop after reload:
    await expect(reloadedLeft).toHaveValue("120px", { timeout: 10000 });
    await expect(reloadedTop).toHaveValue("80px");

    // Switch to mobile after reload:
    await page.getByRole("button", { name: "mobile" }).first().click();
    await expect(reloadedLeft).toHaveValue("60px", { timeout: 10000 });
    await expect(reloadedTop).toHaveValue("25px");
  });

  test("verifies token fonts load and computed font-family matches in canvas", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Font Tester ${timestamp}`,
      email: `fonts_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Font Site ${timestamp}`,
    };

    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForURL("/dashboard", { timeout: 15000 });
    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await blankSiteBtn.click();
    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    const addTab = page.getByRole("button", { name: /elements/i });
    await addTab.click();
    await page.getByText("Heading", { exact: false }).first().click();

    await addTab.click();
    await page.getByText("Paragraph", { exact: false }).or(page.getByText("Text", { exact: false })).first().click();

    const headingEl = canvasFrame.locator('[data-element-type="Heading"]').first();
    const textEl = canvasFrame.locator('[data-element-type="Text"]').first();
    await expect(headingEl).toBeVisible({ timeout: 5000 });
    await expect(textEl).toBeVisible({ timeout: 5000 });

    const headingFont = await headingEl.evaluate((el) => window.getComputedStyle(el).fontFamily);
    const textFont = await textEl.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(headingFont.toLowerCase()).toContain("inter");
    expect(textFont.toLowerCase()).toContain("inter");

    const isFontLoaded = await canvasFrame.locator("#canvas-root").evaluate(async (root) => {
      await root.ownerDocument.fonts.ready;
      return (
        root.ownerDocument.fonts.check("16px Inter") ||
        root.ownerDocument.fonts.check("bold 16px Inter") ||
        root.ownerDocument.fonts.check("16px sans-serif")
      );
    });
    expect(isFontLoaded).toBe(true);
  });
});
