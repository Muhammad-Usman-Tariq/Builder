import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sites, siteVersions } from "./sites.js";

export const deployments = pgTable("deployments", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  versionId: text("version_id").references(() => siteVersions.id, { onDelete: "set null" }),
  provider: text("provider").notNull().default("vercel"),
  status: text("status").notNull().default("pending"), // 'pending' | 'building' | 'ready' | 'error'
  url: text("url"),
  logs: text("logs"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
