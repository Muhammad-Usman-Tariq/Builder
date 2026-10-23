import { TEMPLATES } from "./registry.js";
import { certifyAllTemplates } from "./certify.js";

export function runCliCertification() {
  console.log("\n========================================================");
  console.log("   BUILDER TEMPLATES CERTIFICATION RUNNER (Section 12.4)");
  console.log("========================================================\n");

  const results = certifyAllTemplates(TEMPLATES);
  let allPassed = true;

  for (const res of results) {
    const status = res.valid ? "✅ PASS" : "❌ FAIL";
    console.log(`${status} | ${res.name.padEnd(25)} | Slug: ${res.slug.padEnd(20)} | Pages: ${res.pageCount} | Elements: ${res.elementCount}`);
    if (!res.valid) {
      allPassed = false;
      for (const err of res.errors) {
        console.error(`   - ERROR: ${err}`);
      }
    }
    for (const w of res.warnings) {
      console.warn(`   - WARN: ${w}`);
    }
  }

  console.log("\n--------------------------------------------------------");
  if (allPassed) {
    console.log(`Certification Result: All ${results.length} templates passed 100% of certification checks.\n`);
  } else {
    console.error(`Certification Result: One or more templates failed certification.\n`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes("certify-cli")) {
  runCliCertification();
}
