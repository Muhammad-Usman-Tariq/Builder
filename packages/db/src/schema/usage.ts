import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

export const usageCounters = pgTable("usage_counters", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(), // 'ai_units' | 'storage_bytes' | 'sites'
  period: text("period").notNull(), // '2026-10' or 'lifetime'
  used: integer("used").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
