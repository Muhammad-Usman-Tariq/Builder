import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

export const formSubmissions = pgTable("form_submissions", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  formId: text("form_id").notNull(),
  data: jsonb("data").notNull(),
  spamScore: integer("spam_score").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
