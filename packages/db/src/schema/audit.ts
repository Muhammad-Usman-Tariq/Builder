import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
