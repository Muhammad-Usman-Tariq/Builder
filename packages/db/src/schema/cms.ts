import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";
import { sites } from "./sites.js";

export interface CmsFieldDefinition {
  id: string;
  name: string;
  key: string;
  type: "text" | "rich_text" | "image" | "date" | "slug";
  required?: boolean | undefined;
}

export const cmsCollections = pgTable("cms_collections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  schema: jsonb("schema").$type<CmsFieldDefinition[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cmsEntries = pgTable("cms_entries", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => cmsCollections.id, { onDelete: "cascade" }),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("draft"), // 'draft' | 'published'
  isSample: boolean("is_sample").notNull().default(false),
  data: jsonb("data").$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
