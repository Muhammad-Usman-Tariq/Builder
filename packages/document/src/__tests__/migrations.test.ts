import { describe, it, expect } from "vitest";
import { createBlankDocument, migrateDocument, repairLegacyHomeSlugs } from "../index.js";

describe("Document Migrations", () => {
  it("migrates valid current version document", () => {
    const doc = createBlankDocument();
    const migrated = migrateDocument(doc);
    expect(migrated.schemaVersion).toBe(3);
  });

  it("migrates v1 document with string heading levels to v2 integer levels", () => {
    const doc = createBlankDocument();
    doc.schemaVersion = 1;
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;
    const headingId = "el-test-heading";
    doc.elements[headingId] = {
      id: headingId,
      type: "Heading",
      parentId: rootId,
      children: [],
      props: { text: "Hello", level: "h1" as any },
      styleIds: [],
    };
    doc.elements[rootId]!.children.push(headingId);
    const migrated = migrateDocument(doc);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.elements[headingId]!.props.level).toBe(1);
  });

  it("migrates v2 document with /_root_ slug to /", () => {
    const doc = createBlankDocument();
    doc.schemaVersion = 2;
    const pageId = Object.keys(doc.pages)[0]!;
    doc.pages[pageId]!.slug = "/_root_";
    const migrated = migrateDocument(doc);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.pages[pageId]!.slug).toBe("/");
  });

  it("repairs legacy documents with /_root_, _root_, /root, or root slugs on load", () => {
    const doc = createBlankDocument();
    // Simulate legacy Bean & Brew document created before fix
    doc.schemaVersion = 3;
    const pageId = Object.keys(doc.pages)[0]!;
    doc.pages[pageId]!.slug = "/_root_";
    doc.pages[pageId]!.name = "Home";

    const changed = repairLegacyHomeSlugs(doc);
    expect(changed).toBe(true);
    expect(doc.pages[pageId]!.slug).toBe("/");

    // Calling again returns false (idempotent)
    expect(repairLegacyHomeSlugs(doc)).toBe(false);
  });

  it("throws when document version is newer than current supported version", () => {
    const doc = createBlankDocument();
    (doc as any).schemaVersion = 999;
    expect(() => migrateDocument(doc)).toThrow(/newer than current supported version/);
  });
});
