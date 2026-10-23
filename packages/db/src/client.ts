import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "@builder/config";
import * as schema from "./schema/index.js";

export type DbClient = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  connectionUrl?: string | undefined;
  prepare?: boolean | undefined;
  max?: number | undefined;
}

const clientCache = new Map<string, { sql: postgres.Sql; db: DbClient }>();

/**
 * Creates or retrieves a cached Drizzle client for a given PostgreSQL connection URL.
 */
export function getDb(options?: CreateDbOptions): { sql: postgres.Sql; db: DbClient } {
  let envUrl: string;
  let defaultPrepare = true;

  try {
    const env = getEnv();
    const isTest = env.NODE_ENV === "test" || process.env["NODE_ENV"] === "test";
    envUrl = isTest && env.DATABASE_URL_TEST ? env.DATABASE_URL_TEST : env.DATABASE_URL;
    defaultPrepare = env.DATABASE_PREPARE;
  } catch {
    const isTest = process.env["NODE_ENV"] === "test";
    envUrl =
      isTest && process.env["DATABASE_URL_TEST"]
        ? process.env["DATABASE_URL_TEST"]
        : process.env["DATABASE_URL"] || "";
    defaultPrepare = process.env["DATABASE_PREPARE"] !== "false";
  }

  const url = options?.connectionUrl || envUrl;
  if (!url) {
    throw new Error("DATABASE_URL is required to initialize database client");
  }
  const prepare = options?.prepare ?? defaultPrepare;
  const max = options?.max ?? 10;
  const cacheKey = `${url}::${prepare}::${max}`;

  const cached = clientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sql = postgres(url, {
    prepare,
    max,
    onnotice: () => {}, // Suppress notice noise in tests/migrations
  });

  const db = drizzle(sql, { schema });
  const entry = { sql, db };
  clientCache.set(cacheKey, entry);
  return entry;
}

/**
 * Global default database instance using DATABASE_URL.
 */
let defaultEntry: { sql: postgres.Sql; db: DbClient } | null = null;

export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop, receiver) {
    if (!defaultEntry) {
      defaultEntry = getDb();
    }
    return Reflect.get(defaultEntry.db, prop, receiver);
  },
});

/**
 * Close all active database connections (for test cleanup and graceful shutdown).
 */
export async function closeAllDbConnections(): Promise<void> {
  for (const entry of clientCache.values()) {
    await entry.sql.end();
  }
  clientCache.clear();
  defaultEntry = null;
}
