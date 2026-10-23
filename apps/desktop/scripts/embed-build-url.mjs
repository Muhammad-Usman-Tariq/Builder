import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.resolve(__dirname, "../src/embedded-config.ts");

const appUrl = (process.env.BUILDER_APP_URL || process.env.APP_URL || "").trim();

const content = `// Auto-generated at build time from environment variables. Do not edit manually.
export const EMBEDDED_APP_URL = ${JSON.stringify(appUrl)};
`;

fs.writeFileSync(targetFile, content, "utf-8");
