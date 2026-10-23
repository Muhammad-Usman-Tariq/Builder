import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";
import { sites } from "./sites.js";

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  siteId: text("site_id").references(() => sites.id, { onDelete: "set null" }),
  key: text("key").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  blurhash: text("blurhash"),
  provider: text("provider").notNull().default("s3"),
  providerFileId: text("provider_file_id"),
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
