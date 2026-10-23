import { pgTable, text, timestamp, integer, jsonb, customType } from "drizzle-orm/pg-core";
import type { SiteDocument } from "@builder/document";
import { workspaces } from "./workspaces.js";
import { users } from "./auth.js";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(val: Buffer) {
    return val;
  },
  fromDriver(val: unknown) {
    if (Buffer.isBuffer(val)) return val;
    if (typeof val === "string") return Buffer.from(val, "hex");
    return Buffer.from(val as Uint8Array);
  },
});

export const sites = pgTable("sites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug"),
  thumbnail: text("thumbnail"),
  vercelProjectId: text("vercel_project_id"),
  vercelProjectName: text("vercel_project_name"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteDocuments = pgTable("site_documents", {
  siteId: text("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  yjsState: bytea("yjs_state"),
  snapshot: jsonb("snapshot").$type<SiteDocument>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteVersions = pgTable("site_versions", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").$type<SiteDocument>().notNull(),
  reason: text("reason").notNull().default("manual"), // 'manual' | 'publish' | 'ai'
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
