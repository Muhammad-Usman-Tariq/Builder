import { getDb, templates } from "@builder/db";
import { sql } from "drizzle-orm";
import { TEMPLATES } from "./registry.js";

/**
 * Seeds or updates the certified templates catalog in the PostgreSQL database.
 */
export async function seedTemplates(databaseUrl?: string): Promise<{ count: number }> {
  const { db } = getDb(databaseUrl ? { connectionUrl: databaseUrl } : undefined);
  let seeded = 0;

  for (const t of TEMPLATES) {
    await db
      .insert(templates)
      .values({
        id: t.id,
        slug: t.slug,
        name: t.name,
        category: t.category,
        tags: t.tags,
        preview: t.preview,
        document: t.document,
        version: 1,
      })
      .onConflictDoUpdate({
        target: templates.slug,
        set: {
          name: t.name,
          category: t.category,
          tags: t.tags,
          preview: t.preview,
          document: t.document,
          version: sql`${templates.version} + 1`,
        },
      });
    seeded++;
  }

  return { count: seeded };
}
