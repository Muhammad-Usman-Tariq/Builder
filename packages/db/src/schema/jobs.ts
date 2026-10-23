import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'generate-site' | 'regenerate-section' | 'build-site' | etc.
  status: text("status").notNull().default("queued"), // 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  progress: integer("progress").notNull().default(0),
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
