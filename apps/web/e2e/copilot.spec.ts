import { test, expect } from "./fixtures";
import http from "node:http";
import { createWorker } from "@builder/jobs/worker";

test.describe("AI Copilot: Selection Preservation, Regenerate Section & Rewrite Text", () => {
  let server: http.Server;
  let worker: ReturnType<typeof createWorker>;
  const origEnv = { ...process.env };

  test.beforeAll(async () => {
    // 1. Start local mock OpenAI-compatible AI provider server
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        if (req.url?.includes("/models")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model" }] }));
          return;
        }

        // Return rewritten heading or copilot reply
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-copilot",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Rewritten Catchy Heading",
                },
                finish_reason: "stop",
              },
            ],
          })
        );
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(4040, "127.0.0.1", () => {
        resolve();
      });
      server.on("error", reject);
    });

    // Configure simulated AI provider in env
    process.env["AI_MODEL_CHAIN"] = "testsim:mock-model";
    process.env["AI_PROVIDER_TESTSIM_TYPE"] = "openai-compatible";
    process.env["AI_PROVIDER_TESTSIM_BASE_URL"] = "http://127.0.0.1:4040/v1";
    process.env["AI_PROVIDER_TESTSIM_API_KEY"] = "mock-key";

    worker = createWorker();
  });

  test.afterAll(async () => {
    if (worker) {
      await worker.close(true);
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Restore env
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("AI_PROVIDER_TESTSIM_") || k === "AI_MODEL_CHAIN") {
        delete process.env[k];
      }
    }
    Object.assign(process.env, origEnv);
  });

  test("select section -> Regenerate -> preview -> Reject leaves unchanged -> Accept -> changed -> Undo restores -> reload persists", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Copilot Sec Tester ${timestamp}`,
      email: `copilot_sec_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Copilot Site ${timestamp}`,
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

    // 3. Navigate into editor
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 4. Open "elements" Add panel
    const elementsTab = page.getByRole("button", { name: /elements/i });
    await expect(elementsTab).toBeVisible({ timeout: 5000 });
    await elementsTab.click();

    // 5. Insert a Section
    const sectionBtn = page.getByText("Section", { exact: true }).first();
    await expect(sectionBtn).toBeVisible({ timeout: 5000 });
    await sectionBtn.click();

    // 6. Inside that section, insert a Heading
    const headingBtn = page.getByText("Heading", { exact: true }).first();
    await expect(headingBtn).toBeVisible({ timeout: 5000 });
    await headingBtn.click();

    // Verify initial heading text on canvas
    const headingOnCanvas = canvasFrame.getByText("Heading Text").first();
    await expect(headingOnCanvas).toBeVisible({ timeout: 5000 });

    // Wait for autosave to ensure document is in database
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    // 7. Select the section in layers or on canvas
    const layersTab = page.getByRole("button", { name: /layers/i });
    await layersTab.click();
    const sectionLayer = page.getByText("Section", { exact: true }).first();
    await expect(sectionLayer).toBeVisible({ timeout: 5000 });
    await sectionLayer.click();

    // 8. Open AI Copilot modal
    const copilotBtn = page.getByTestId("copilot-btn");
    await expect(copilotBtn).toBeVisible();
    await copilotBtn.click();

    // 9. Switch to "Regenerate Section" tab
    const regTabBtn = page.getByRole("button", { name: "Regenerate Section", exact: true });
    await expect(regTabBtn).toBeVisible();
    await regTabBtn.click();

    // Fill instruction prompt
    const promptInput = page.getByTestId("copilot-section-prompt-input");
    await expect(promptInput).toBeVisible();
    await promptInput.fill("Modern high-converting layout");

    // Click Regenerate Section
    const regSubmitBtn = page.getByTestId("copilot-regenerate-submit-btn");
    await expect(regSubmitBtn).toBeVisible();
    await regSubmitBtn.click();

    // 10. Live progress appears while worker executes
    await expect(page.getByTestId("copilot-progress")).toBeVisible({ timeout: 5000 });

    // 11. Result arrives: preview shows Accept and Reject buttons
    const acceptBtn = page.getByTestId("copilot-accept-btn");
    const rejectBtn = page.getByTestId("copilot-reject-btn");
    await expect(acceptBtn).toBeVisible({ timeout: 15000 });
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });

    // 12. Test REJECT: click Reject leaves the section unchanged
    await rejectBtn.click();
    await expect(acceptBtn).not.toBeVisible();
    // Heading on canvas remains "Heading Text"
    await expect(headingOnCanvas).toHaveText("Heading Text");

    // 13. Regenerate Section again and ACCEPT
    await page.getByTestId("copilot-regenerate-submit-btn").click();
    await expect(page.getByTestId("copilot-accept-btn")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("copilot-accept-btn").click();

    // Modal closes on Accept
    await expect(page.getByTestId("copilot-accept-btn")).not.toBeVisible();

    // 14. Section heading on canvas is now changed
    const enhancedHeading = canvasFrame.getByText(/Enhanced: Modern high-converting/i).first();
    await expect(enhancedHeading).toBeVisible({ timeout: 10000 });

    // 15. Click UNDO: restores original heading text
    const undoBtn = page.getByTestId("undo-btn");
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(canvasFrame.getByText("Heading Text").first()).toBeVisible({ timeout: 5000 });

    // 16. Click REDO: restores the accepted change
    const redoBtn = page.getByTestId("redo-btn");
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await expect(enhancedHeading).toBeVisible({ timeout: 5000 });

    // 17. Wait for autosave "Saved"
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    // 18. Reload page: reload keeps the accepted change
    await page.reload();
    const reloadedCanvas = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(
      reloadedCanvas.getByText(/Enhanced: Modern high-converting/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("select heading -> Rewrite Text -> preview -> Reject leaves unchanged -> Accept -> changed -> Undo restores", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `Copilot Rewrite Tester ${timestamp}`,
      email: `copilot_rew_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Rewrite Site ${timestamp}`,
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

    // 3. Navigate into editor
    await page.waitForURL(/\/editor\/site_/, { timeout: 15000 });
    const canvasFrame = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(canvasFrame.locator("#canvas-root")).toBeVisible({ timeout: 10000 });

    // 4. Open "elements" Add panel
    await page.getByRole("button", { name: /elements/i }).click();

    // 5. Insert a Heading
    const headingBtn = page.getByText("Heading", { exact: true }).first();
    await expect(headingBtn).toBeVisible({ timeout: 5000 });
    await headingBtn.click();

    const headingOnCanvas = canvasFrame.getByText("Heading Text").first();
    await expect(headingOnCanvas).toBeVisible({ timeout: 5000 });

    // Click heading on canvas to ensure selection is active
    await headingOnCanvas.click();

    // 6. Open AI Copilot modal
    await page.getByTestId("copilot-btn").click();

    // 7. Verify Rewrite Text tab is active and shows selected element's current text
    await expect(page.getByText(/Current Text/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('"Heading Text"')).toBeVisible();

    // 8. Submit rewrite
    const rewriteSubmitBtn = page.getByTestId("copilot-rewrite-submit-btn");
    await expect(rewriteSubmitBtn).toBeVisible();
    await rewriteSubmitBtn.click();

    // 9. Preview appears with Accept and Reject buttons
    const acceptBtn = page.getByTestId("copilot-accept-btn");
    const rejectBtn = page.getByTestId("copilot-reject-btn");
    await expect(acceptBtn).toBeVisible({ timeout: 10000 });
    await expect(rejectBtn).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('"Rewritten Catchy Heading"')).toBeVisible();

    // 10. Test REJECT: click Reject leaves heading unchanged
    await rejectBtn.click();
    await expect(acceptBtn).not.toBeVisible();
    await expect(headingOnCanvas).toHaveText("Heading Text");

    // 11. Submit rewrite again and ACCEPT
    await page.getByTestId("copilot-rewrite-submit-btn").click();
    await expect(page.getByTestId("copilot-accept-btn")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("copilot-accept-btn").click();

    // Modal closes
    await expect(page.getByTestId("copilot-accept-btn")).not.toBeVisible();

    // 12. Heading on canvas changed to rewritten text
    const rewrittenHeading = canvasFrame.getByText("Rewritten Catchy Heading").first();
    await expect(rewrittenHeading).toBeVisible({ timeout: 5000 });

    // 13. Click UNDO: restores original heading text
    const undoBtn = page.getByTestId("undo-btn");
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(canvasFrame.getByText("Heading Text").first()).toBeVisible({ timeout: 5000 });

    // 14. Click REDO: restores the accepted change
    const redoBtn = page.getByTestId("redo-btn");
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();
    await expect(rewrittenHeading).toBeVisible({ timeout: 5000 });

    // 15. Wait for autosave "Saved"
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10000 });

    // 16. Reload page: reload keeps the accepted change
    await page.reload();
    const reloadedCanvas = page.frameLocator('iframe[title="Editor Canvas Viewport"]');
    await expect(reloadedCanvas.getByText("Rewritten Catchy Heading").first()).toBeVisible({
      timeout: 10000,
    });
  });
});
