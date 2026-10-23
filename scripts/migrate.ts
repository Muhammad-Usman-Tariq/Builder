if (process.argv.includes("--test")) {
  process.env["NODE_ENV"] = "test";
}

import { getDb, runMigrations, closeAllDbConnections } from "@builder/db";

async function main() {
  const isTest = process.env["NODE_ENV"] === "test";
  console.log(`Applying database migrations${isTest ? " (TEST database)" : ""}...`);
  const { sql } = getDb();
  await runMigrations(sql);
  await closeAllDbConnections();
  console.log("Database migrations successfully applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
