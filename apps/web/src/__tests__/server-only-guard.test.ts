import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Server-only Guard Verification", () => {
  it("apps/web/src/server/env.ts contains import 'server-only' guard", () => {
    const envFilePath = path.resolve(__dirname, "../server/env.ts");
    expect(fs.existsSync(envFilePath)).toBe(true);
    const content = fs.readFileSync(envFilePath, "utf-8");
    expect(content).toContain('import "server-only";');
    expect(content).toContain('export * from "@builder/config/env";');
  });

  it("ESLint configuration strictly restricts direct import of @builder/config/env in apps/web", () => {
    const eslintConfigPath = path.resolve(__dirname, "../../eslint.config.mjs");
    expect(fs.existsSync(eslintConfigPath)).toBe(true);
    const content = fs.readFileSync(eslintConfigPath, "utf-8");
    expect(content).toContain("no-restricted-imports");
    expect(content).toContain("@builder/config/env");
    expect(content).toContain("Do not import @builder/config/env directly in apps/web");
  });

  it("runtime guard in @builder/config/env refuses to run in browser context", () => {
    const envSourcePath = path.resolve(__dirname, "../../../../packages/config/src/env.ts");
    const content = fs.readFileSync(envSourcePath, "utf-8");
    expect(content).toContain('typeof window !== "undefined"');
    expect(content).toContain("CRITICAL: @builder/config/env cannot be imported in client-side code");
  });
});
