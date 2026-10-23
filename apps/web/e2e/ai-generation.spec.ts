import { test, expect } from "./fixtures";
import http from "node:http";
import { createWorker } from "@builder/jobs/worker";

test.describe("AI Generation Lifecycle & Multi-Page Editor Persistence (Batch A)", () => {
  let server: http.Server;
  let serverPort: number;
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
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (req.url?.includes("/models")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ object: "list", data: [{ id: "mock-model" }] }));
          return;
        }

        // Determine if request is plan or sections based on prompt content
        const promptText = JSON.stringify(parsed);
        const isPlanRequest =
          promptText.includes("site plan") || promptText.includes("comprehensive site plan");

        if (isPlanRequest) {
          const planResponse = {
            brief: {
              businessType: "Artisan Bistro",
              audience: "Local foodies and wine enthusiasts",
              tone: "Warm, sophisticated, inviting",
              goals: ["Table reservations", "Explore seasonal menu", "Private events"],
              primaryColorName: "amber",
            },
            theme: {
              colors: {
                primary: "#d97706",
                secondary: "#78350f",
                background: "#ffffff",
                surface: "#fef3c7",
                text: "#1c1917",
                muted: "#78716c",
                border: "#e7e5e4",
                accent: "#f59e0b",
              },
              fonts: {
                heading: "Playfair Display",
                body: "Inter",
              },
              spacing: 8,
              radius: 8,
            },
            pages: [
              {
                name: "Home",
                slug: "/",
                title: "Artisan Bistro | Handcrafted Dining",
                description: "Experience farm-to-table cuisine in an intimate atmosphere.",
                sections: [
                  {
                    name: "Hero Section",
                    purpose: "Welcome dining hero",
                    layout: "hero",
                  },
                  {
                    name: "Features Section",
                    purpose: "Key culinary highlights",
                    layout: "features",
                  },
                ],
              },
              {
                name: "Menu",
                slug: "/menu",
                title: "Seasonal Menu | Artisan Bistro",
                description: "Our daily rotating culinary offerings.",
                sections: [
                  {
                    name: "Menu Hero",
                    purpose: "Menu overview header",
                    layout: "hero",
                  },
                  {
                    name: "Dishes Grid",
                    purpose: "List of seasonal specialties",
                    layout: "content",
                  },
                ],
              },
            ],
          };

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "chatcmpl-plan",
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model: "mock-model",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: JSON.stringify(planResponse),
                  },
                  finish_reason: "stop",
                },
              ],
            })
          );
          return;
        }

        // Page sections response (in page mode, returns sections array)
        const isMenuPage = promptText.includes("Menu");
        const pageTitle = isMenuPage ? "Seasonal Menu" : "Artisan Dining";
        const sectionName1 = isMenuPage ? "Menu Hero" : "Hero Section";
        const sectionName2 = isMenuPage ? "Dishes Grid" : "Features Section";

        const sectionsResponse = {
          sections: [
            {
              name: sectionName1,
              purpose: "Hero overview",
              nodes: [
                {
                  id: "sec_root_1",
                  parentId: null,
                  type: "Section",
                  name: sectionName1,
                  style: {
                    padding: "64px 24px",
                    backgroundColor: "#fef3c7",
                  },
                },
                {
                  id: "heading_1",
                  parentId: "sec_root_1",
                  type: "Heading",
                  name: "Hero Title",
                  props: {
                    text: pageTitle,
                    level: 1,
                  },
                  style: {
                    color: "#1c1917",
                    fontSize: "40px",
                  },
                },
                {
                  id: "desc_1",
                  parentId: "sec_root_1",
                  type: "Text",
                  name: "Hero Subtitle",
                  props: {
                    text: "Handcrafted organic dishes served daily with love and precision.",
                  },
                  style: {
                    color: "#78716c",
                    fontSize: "18px",
                  },
                },
              ],
            },
            {
              name: sectionName2,
              purpose: "Highlight content",
              nodes: [
                {
                  id: "sec_root_2",
                  parentId: null,
                  type: "Section",
                  name: sectionName2,
                  style: {
                    padding: "48px 24px",
                    backgroundColor: "#ffffff",
                  },
                },
                {
                  id: "heading_2",
                  parentId: "sec_root_2",
                  type: "Heading",
                  name: "Section Heading",
                  props: {
                    text: isMenuPage ? "Appetizers & Mains" : "Signature Specialties",
                    level: 2,
                  },
                  style: {
                    color: "#1c1917",
                    fontSize: "28px",
                  },
                },
              ],
            },
          ],
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "chatcmpl-sections",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "mock-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify(sectionsResponse),
                },
                finish_reason: "stop",
              },
            ],
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    // Configure simulated AI provider in env
    process.env["AI_MODEL_CHAIN"] = "testsim:mock-model";
    process.env["AI_PROVIDER_TESTSIM_TYPE"] = "openai-compatible";
    process.env["AI_PROVIDER_TESTSIM_BASE_URL"] = `http://127.0.0.1:${serverPort}/v1`;
    process.env["AI_PROVIDER_TESTSIM_API_KEY"] = "mock-key";
    process.env["AI_GENERATION_MODE"] = "page";

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
      if (k.startsWith("AI_PROVIDER_TESTSIM_") || k === "AI_MODEL_CHAIN" || k === "AI_GENERATION_MODE") {
        delete process.env[k];
      }
    }
    Object.assign(process.env, origEnv);
  });

  test("generates a multi-page site with simulated AI provider, editor renders all pages & sections, and persists on reload", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testUser = {
      name: `AI Tester ${timestamp}`,
      email: `aitest_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `Artisan Bistro ${timestamp}`,
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

    // 3. Open "Create with AI" modal
    const aiBtn = page.getByTestId("create-ai-btn");
    await expect(aiBtn).toBeVisible({ timeout: 10000 });
    await aiBtn.click();

    // Modal is visible
    await expect(page.getByRole("heading", { name: "Build Website with AI" })).toBeVisible({
      timeout: 5000,
    });

    // 4. Fill site name and prompt
    await page.getByTestId("ai-site-name-input").fill(testUser.siteName);
    await page
      .getByTestId("ai-prompt-input")
      .fill("An intimate artisan bistro in downtown with seasonal tasting menu, wine pairings, and reservations.");

    // 5. Submit generation
    const submitBtn = page.getByTestId("ai-generate-submit-btn");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 6. Modal transitions to running state with live progress bar
    await expect(page.getByText(/Generating Website/i)).toBeVisible({ timeout: 10000 });

    // 7. Wait for generation to succeed and automatically navigate to Editor
    await page.waitForURL(/\/editor\/site_/, { timeout: 25000 });

    // 8. Editor loaded: verify site title matches
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 15000 });

    // 9. Verify pages exist in page selector
    const pageSelect = page.getByRole("combobox").first();
    await expect(pageSelect).toBeVisible();

    // Home page elements and sections are present on canvas
    const canvasFrame = page.frameLocator("iframe").first();
    await expect(canvasFrame.getByText("Artisan Dining")).toBeVisible({ timeout: 10000 });
    await expect(canvasFrame.getByText(/Handcrafted organic dishes/i)).toBeVisible({ timeout: 10000 });

    // Switch to Menu page in editor
    await pageSelect.selectOption({ label: "Menu" });

    // Verify Menu page content rendered
    await expect(canvasFrame.getByText("Seasonal Menu")).toBeVisible({ timeout: 10000 });
    await expect(canvasFrame.getByText("Appetizers & Mains")).toBeVisible({ timeout: 10000 });

    // 10. Reload the page: tests document persistence & Yjs rehydration
    await page.reload();

    // Verify editor rehydrates cleanly without any empty starter document
    await expect(page.getByTitle(testUser.siteName)).toBeVisible({ timeout: 15000 });
    const reloadedCanvas = page.frameLocator("iframe").first();
    // Re-check elements on reloaded canvas
    await expect(
      reloadedCanvas.getByText("Artisan Dining").or(reloadedCanvas.getByText("Seasonal Menu"))
    ).toBeVisible({ timeout: 15000 });
  });
});
