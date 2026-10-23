import { assertValidSiteDocument } from "../validator/index.js";
import type { SiteDocument } from "../types/index.js";

export const CURRENT_SCHEMA_VERSION = 3;

export type MigrationFn = (doc: any) => any;

/**
 * Migration steps from version N to N + 1.
 */
export const MIGRATIONS: Record<number, MigrationFn> = {
  1: (doc: any) => {
    if (doc.elements && typeof doc.elements === "object") {
      for (const elId of Object.keys(doc.elements)) {
        const el = doc.elements[elId];
        if (el?.type === "Heading" && el.props) {
          if (typeof el.props.level !== "number") {
            const rawStr = String(el.props.level ?? "");
            const parsed = parseInt(rawStr.replace(/\D/g, ""), 10);
            el.props.level = Math.min(Math.max(parsed || 2, 1), 6);
          }
        }
      }
    }
    return doc;
  },
  2: (doc: any) => {
    repairLegacyHomeSlugs(doc);
    return doc;
  },
};

/**
 * Repairs legacy home page slugs ('/_root_', '_root_', '/root', 'root') to '/'.
 * If no page has slug '/', assigns '/' to the page named 'home' or the first page.
 * Returns true if any slug was modified.
 */
export function repairLegacyHomeSlugs(doc: any): boolean {
  if (!doc || !doc.pages || typeof doc.pages !== "object") return false;
  let changed = false;
  const pageEntries = Object.values(doc.pages) as any[];

  for (const page of pageEntries) {
    if (
      page &&
      (page.slug === "/_root_" ||
        page.slug === "_root_" ||
        page.slug === "/root" ||
        page.slug === "root")
    ) {
      page.slug = "/";
      changed = true;
    }
  }

  const hasRoot = pageEntries.some((p) => p && p.slug === "/");
  if (!hasRoot && pageEntries.length > 0) {
    const homePage =
      pageEntries.find((p) => p && p.name && p.name.toLowerCase() === "home") ||
      pageEntries[0];
    if (homePage) {
      homePage.slug = "/";
      changed = true;
    }
  }

  return changed;
}

/**
 * Migrates a document from its current schemaVersion up to targetVersion.
 */
export function migrateDocument(
  rawDoc: unknown,
  targetVersion = CURRENT_SCHEMA_VERSION
): SiteDocument {
  if (!rawDoc || typeof rawDoc !== "object") {
    throw new Error("Cannot migrate invalid document: root must be an object.");
  }

  let doc = JSON.parse(JSON.stringify(rawDoc));
  const startingVersion = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;

  if (startingVersion > targetVersion) {
    throw new Error(
      `Document version ${startingVersion} is newer than current supported version ${targetVersion}.`
    );
  }

  let currentVersion = startingVersion;
  while (currentVersion < targetVersion) {
    const migration = MIGRATIONS[currentVersion];
    if (!migration) {
      throw new Error(`Missing migration step from version ${currentVersion} to ${currentVersion + 1}.`);
    }

    doc = migration(doc);
    currentVersion += 1;
    doc.schemaVersion = currentVersion;
  }

  doc.schemaVersion = targetVersion;
  repairLegacyHomeSlugs(doc);
  assertValidSiteDocument(doc);
  return doc;
}
