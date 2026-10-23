import { getDb, runMigrations, closeAllDbConnections } from "@builder/db";

async function main() {
  console.log("Applying database migrations...");
  const { sql } = getDb();
  await runMigrations(sql);
  await closeAllDbConnections();
  console.log("Database migrations successfully applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
