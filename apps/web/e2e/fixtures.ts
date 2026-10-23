import { test as base, expect } from "@playwright/test";
import { isAllowedConsoleMessage } from "./console-allowlist";

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];

    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();

      // Check if message is benign dev-only noise documented in allowlist
      if (isAllowedConsoleMessage(text)) {
        return;
      }

      // Catch real console errors and React/Next.js warnings
      if (type === "error") {
        errors.push(`[console.error] ${text}`);
      } else if (
        type === "warning" &&
        (text.includes("Warning:") ||
          text.includes("React") ||
          text.includes("Next.js") ||
          text.toLowerCase().includes("unrecognized") ||
          text.toLowerCase().includes("invalid"))
      ) {
        errors.push(`[console.warning] ${text}`);
      }
    });

    page.on("pageerror", (err) => {
      errors.push(`[pageerror] ${err.message || String(err)}`);
    });

    await use(page);

    if (errors.length > 0) {
      throw new Error(
        `GLOBAL TEST RULE VIOLATION: Browser console error or React/Next.js warning detected during test execution:\n${errors.join("\n")}`
      );
    }
  },
});

export { expect };
