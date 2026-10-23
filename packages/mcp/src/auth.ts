import { eq, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db, schema } from "@builder/db";
import type { McpAuthContext } from "./types.js";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Authenticates an incoming MCP Bearer token against workspace API keys.
 * Non-negotiable Rule 5 & Architecture Section 13.3.
 */
export async function authenticateMcpToken(
  rawToken: string
): Promise<McpAuthContext> {
  const token = rawToken.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Missing or empty MCP authorization token");
  }

  const hashed = hashToken(token);

  const [apiKey] = await db
    .select()
    .from(schema.apiKeys)
    .where(or(eq(schema.apiKeys.keyHash, hashed), eq(schema.apiKeys.key, token)));

  if (!apiKey) {
    throw new Error("Invalid MCP API token: authentication failed");
  }

  // Update last used timestamp
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, apiKey.id));

  return {
    workspaceId: apiKey.workspaceId,
    apiKeyId: apiKey.id,
    keyName: apiKey.name,
    permission: (apiKey.permission as "read-only" | "read-write") || "read-write",
  };
}
