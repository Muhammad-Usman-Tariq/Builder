import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES } from "./registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../../templates/data");

export function dumpTemplatesJson() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const t of TEMPLATES) {
    const filePath = path.join(outputDir, `${t.slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(t, null, 2), "utf-8");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  dumpTemplatesJson();
  console.log(`Successfully dumped ${TEMPLATES.length} template JSON files to ${outputDir}`);
}
