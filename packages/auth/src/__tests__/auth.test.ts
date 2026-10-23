import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { createAuth } from "../auth.js";

// Auto-load root .env if running standalone
const envFile = path.resolve(process.cwd(), "../../.env");
if (!process.env["DATABASE_URL_TEST"] && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function isConfiguredDatabaseUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.includes("USER:PASSWORD") ||
    trimmed.includes("HOST:PORT") ||
    trimmed.includes("DBNAME") ||
    trimmed.includes("strong_password_here") ||
    trimmed.includes("your-") ||
    trimmed.includes("<")
  ) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
    if (!parsed.hostname || parsed.hostname === "HOST") return false;
    if (parsed.username === "USER") return false;
    return true;
  } catch {
    return false;
  }
}

const testDbUrl = process.env["DATABASE_URL_TEST"];
const isDbConfigured = isConfiguredDatabaseUrl(testDbUrl);
if (!isDbConfigured) {
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping Auth integration tests.");
}

describe.skipIf(!isDbConfigured)("Better Auth Real Integration Tests (builder_test)", () => {
  let dbClient: ReturnType<typeof getDb>;
  let testAuth: ReturnType<typeof createAuth>;

  beforeAll(async () => {
    dbClient = getDb({ connectionUrl: testDbUrl });
    await runMigrations(dbClient.sql);
    testAuth = createAuth({
      db: dbClient.db,
      secret: "super-secure-test-auth-secret-32-chars-long!",
      baseURL: "http://localhost:3000",
    });
  });

  afterAll(async () => {
    await closeAllDbConnections();
  });

  it("signs up a new user and automatically creates their personal workspace as OWNER", async () => {
    const testSuffix = Math.random().toString(36).substring(2, 8);
    const email = `testuser_${testSuffix}@example.com`;
    const password = "Password123!Secure";
    const name = `Test User ${testSuffix}`;

    // Sign up through Better Auth API
    const response = await testAuth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    expect(response).toBeDefined();
    expect(response.user).toBeDefined();
    expect(response.user.email).toBe(email);
    expect(response.user.name).toBe(name);

    // Verify user exists in PostgreSQL users table
    const [dbUser] = await dbClient.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, response.user.id));
    expect(dbUser).toBeDefined();
    expect(dbUser?.email).toBe(email);

    // Verify personal workspace was automatically created
    const [workspace] = await dbClient.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.ownerId, response.user.id));
    expect(workspace).toBeDefined();
    expect(workspace?.name).toContain("Workspace");

    // Verify workspace membership with OWNER role
    const [membership] = await dbClient.db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, response.user.id));
    expect(membership).toBeDefined();
    expect(membership?.workspaceId).toBe(workspace?.id);
    expect(membership?.role).toBe("OWNER");
  });
});
