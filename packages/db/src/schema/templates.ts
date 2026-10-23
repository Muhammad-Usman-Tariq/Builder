import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import type { SiteDocument } from "@builder/document";

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  preview: text("preview"),
  document: jsonb("document").$type<SiteDocument>().notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
