import { test, expect } from "./fixtures";

test.describe("E2: Small CMS Full Lifecycle E2E", () => {
  test("adds sample blog, views CMS list, previews dynamic page, edits entry and sees canvas update", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `CMS Tester ${timestamp}`,
      email: `cmstester_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `CMS Showcase Site ${timestamp}`,
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

    // 3. Navigate into editor
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 10000 });

    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 4. Switch to CMS tab in left panel
    const cmsTabBtn = page.getByTestId("tab-cms");
    await expect(cmsTabBtn).toBeVisible({ timeout: 5000 });
    await cmsTabBtn.click();

    // 5. Click "Add sample blog" button
    const addSampleBtn = page.getByTestId("add-sample-blog-btn");
    await expect(addSampleBtn).toBeVisible({ timeout: 5000 });
    await addSampleBtn.click();

    // 6. Verify "Blog" collection appears
    const blogColItem = page.getByTestId("collection-item-blog");
    await expect(blogColItem).toBeVisible({ timeout: 15000 });

    // Click "Blog" collection to open its entries
    await blogColItem.click();

    // 7. Verify sample entries are listed
    const welcomeEntry = page.getByText(/Sample: Welcome to our new blog/i).first();
    await expect(welcomeEntry).toBeVisible({ timeout: 10000 });

    // 8. Check /blog card grid layout across breakpoints (3 cols desktop, 2 cols tablet, 1 col mobile)
    const pageSelect = page.getByRole("combobox").first();
    await pageSelect.selectOption({ label: "Blog (/blog)" });
    await expect(canvasFrame.getByText("Our Blog")).toBeVisible({ timeout: 10000 });
    const cards = canvasFrame.locator(".cms-list-item");
    await expect(cards).toHaveCount(3);

    // Desktop: 3 columns (all 3 cards share the same row)
    await page.getByTitle(/Desktop/i).click();
    await page.waitForTimeout(300);
    const desktopBoxes = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
      cards.nth(2).boundingBox(),
    ]);
    expect(desktopBoxes[0]).toBeTruthy();
    expect(desktopBoxes[1]).toBeTruthy();
    expect(desktopBoxes[2]).toBeTruthy();
    expect(Math.abs(desktopBoxes[0]!.y - desktopBoxes[1]!.y)).toBeLessThan(5);
    expect(Math.abs(desktopBoxes[1]!.y - desktopBoxes[2]!.y)).toBeLessThan(5);
    // Cards align at top with equal height
    expect(Math.abs(desktopBoxes[0]!.height - desktopBoxes[1]!.height)).toBeLessThan(5);
    expect(Math.abs(desktopBoxes[1]!.height - desktopBoxes[2]!.height)).toBeLessThan(5);
    // 16:9 image aspect ratio
    const firstCardImg = cards.nth(0).locator("img").first();
    const imgBox = await firstCardImg.boundingBox();
    if (imgBox) {
      const ratio = imgBox.width / imgBox.height;
      expect(Math.abs(ratio - 16 / 9)).toBeLessThan(0.2);
    }
    // Author/date line under the post title
    const firstCardTitle = cards.nth(0).locator('[data-cms-field="title"]').first();
    const firstCardMeta = cards.nth(0).locator('[data-element-id="el_blog_card_meta"]').first();
    const titleBox = await firstCardTitle.boundingBox();
    const metaBox = await firstCardMeta.boundingBox();
    if (titleBox && metaBox) {
      expect(metaBox.y).toBeGreaterThan(titleBox.y);
    }

    // Tablet: 2 columns (cards 0 and 1 on row 1, card 2 on row 2)
    await page.getByTitle(/Tablet/i).click();
    await page.waitForTimeout(300);
    const tabletBoxes = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
      cards.nth(2).boundingBox(),
    ]);
    expect(tabletBoxes[0]).toBeTruthy();
    expect(tabletBoxes[1]).toBeTruthy();
    expect(tabletBoxes[2]).toBeTruthy();
    expect(Math.abs(tabletBoxes[0]!.y - tabletBoxes[1]!.y)).toBeLessThan(5);
    expect(tabletBoxes[2]!.y).toBeGreaterThan(tabletBoxes[0]!.y + 20);

    // Mobile: 1 column (each card on its own row)
    await page.getByTitle(/Mobile/i).click();
    await page.waitForTimeout(300);
    const mobileBoxes = await Promise.all([
      cards.nth(0).boundingBox(),
      cards.nth(1).boundingBox(),
      cards.nth(2).boundingBox(),
    ]);
    expect(mobileBoxes[0]).toBeTruthy();
    expect(mobileBoxes[1]).toBeTruthy();
    expect(mobileBoxes[2]).toBeTruthy();
    expect(mobileBoxes[1]!.y).toBeGreaterThan(mobileBoxes[0]!.y + 20);
    expect(mobileBoxes[2]!.y).toBeGreaterThan(mobileBoxes[1]!.y + 20);

    // Reset back to desktop
    await page.getByTitle(/Desktop/i).click();

    // 9. Switch to the dynamic page template: /blog/[slug]
    await pageSelect.selectOption({ label: "Blog Post (/blog/[slug])" });

    // Verify top dynamic preview bar is displayed
    await expect(page.getByText("Dynamic Preview:")).toBeVisible({ timeout: 10000 });

    // Select "Sample: Welcome to our new blog" in the dynamic preview select
    const previewSelect = page.getByTestId("dynamic-preview-entry-select");
    await expect(previewSelect).toBeVisible({ timeout: 5000 });
    await previewSelect.selectOption({ label: "Sample: Welcome to our new blog" });

    // Verify the canvas iframe displays the dynamic title of the sample post
    await expect(canvasFrame.getByText(/Sample: Welcome to our new blog/i).first()).toBeVisible({ timeout: 10000 });

    // Section F.5 Visual checks for post template at 1440, 768 and 375 widths
    const titleH1 = canvasFrame.locator("h1").first();
    await expect(titleH1).toBeVisible({ timeout: 5000 });

    const breakpoints = [
      { name: "desktop", title: /Desktop/i },
      { name: "tablet", title: /Tablet/i },
      { name: "mobile", title: /Mobile/i },
    ];

    for (const bp of breakpoints) {
      await page.getByTitle(bp.title).click();
      await page.waitForTimeout(200);

      // Verify title is an H1
      const isH1 = await titleH1.evaluate((el) => el.tagName.toLowerCase() === "h1");
      expect(isH1).toBe(true);

      // Verify title and date/author are on separate lines
      const titleBox = await titleH1.boundingBox();
      const metaEl = canvasFrame.locator("text=/2026|min read|Written by/i").first();
      if ((await metaEl.count()) > 0) {
        const metaBox = await metaEl.boundingBox();
        if (titleBox && metaBox) {
          // Verify meta and title are on separate lines (vertical separation)
          expect(Math.abs(metaBox.y - titleBox.y)).toBeGreaterThan(20);
        }
      }

      // Verify image height within limits
      const coverImg = canvasFrame.locator("img").first();
      if ((await coverImg.count()) > 0) {
        const imgBox = await coverImg.boundingBox();
        if (imgBox) {
          expect(imgBox.height).toBeLessThanOrEqual(550);
          expect(imgBox.height).toBeGreaterThan(40);
        }
      }

      // Verify no horizontal overflow inside canvas
      const hasOverflow = await canvasFrame.locator("#canvas-root").evaluate((el) => {
        return el.scrollWidth > el.clientWidth + 5;
      });
      expect(hasOverflow).toBe(false);
    }

    // Reset back to desktop breakpoint
    await page.getByTitle(/Desktop/i).click();

    // 9. Edit the sample entry: Click title to open inline editor
    await welcomeEntry.click();

    const editTitleInput = page.getByTestId("edit-entry-title-input");
    await expect(editTitleInput).toBeVisible({ timeout: 5000 });
    await editTitleInput.fill("Sample: Welcome to our amazing blog");

    const saveEntryBtn = page.getByTestId("save-entry-btn");
    await expect(saveEntryBtn).toBeVisible({ timeout: 5000 });
    await saveEntryBtn.click();

    // 10. Verify canvas updates and shows the new title
    await expect(canvasFrame.getByText(/Sample: Welcome to our amazing blog/i).first()).toBeVisible({ timeout: 10000 });

    // 11. Go back to collections and remove sample content
    const backBtn = page.getByText("← Collections");
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();

    const removeSampleBtn = page.getByTestId("remove-sample-blog-btn");
    await expect(removeSampleBtn).toBeVisible({ timeout: 5000 });
    await removeSampleBtn.click();

    // Verify Blog collection is removed
    await expect(page.getByTestId("collection-item-blog")).not.toBeVisible({ timeout: 10000 });
  });
});
