import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { sites } from "./sites.js";

export const domains = pgTable("domains", {
  id: text("id").primaryKey(),
  siteId: text("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  sslStatus: text("ssl_status").notNull().default("pending"),
  verificationRecords: jsonb("verification_records").$type<any[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
