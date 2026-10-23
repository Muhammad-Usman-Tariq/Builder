import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      AI_MODEL_CHAIN: process.env.AI_MODEL_CHAIN || "testsim:mock-model",
      AI_PROVIDER_TESTSIM_TYPE: "openai-compatible",
      AI_PROVIDER_TESTSIM_BASE_URL: process.env.AI_PROVIDER_TESTSIM_BASE_URL || "http://127.0.0.1:4040/v1",
      AI_PROVIDER_TESTSIM_API_KEY: "mock-key",
    },
  },
});
