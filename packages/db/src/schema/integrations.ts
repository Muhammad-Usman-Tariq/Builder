import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'vercel'
  encryptedTokens: text("encrypted_tokens").notNull(),
  scopes: jsonb("scopes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
