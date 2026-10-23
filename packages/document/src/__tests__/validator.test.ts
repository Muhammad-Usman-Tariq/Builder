import { describe, it, expect } from "vitest";
import {
  createBlankDocument,
  validateSiteDocument,
  assertValidSiteDocument,
  DocumentValidationError,
} from "../index.js";

describe("Document Validator", () => {
  it("passes valid blank document", () => {
    const doc = createBlankDocument();
    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(() => assertValidSiteDocument(doc)).not.toThrow();
  });

  it("detects missing root element on page", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    doc.pages[pageId]!.rootId = "non-existent-id";

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_ROOT_ELEMENT")).toBe(true);
  });

  it("detects invalid root element type (must be Body)", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;
    doc.elements[rootId]!.type = "Section";

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_ROOT_TYPE")).toBe(true);
  });

  it("detects broken parent-child link", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;

    // Add child to root, but child points to wrong parent
    doc.elements["el-child"] = {
      id: "el-child",
      type: "Button",
      parentId: "wrong-parent-id",
      children: [],
      props: {},
      styleIds: [],
    };
    doc.elements[rootId]!.children.push("el-child");

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "BROKEN_PARENT_LINK")).toBe(true);
  });

  it("detects orphaned elements", () => {
    const doc = createBlankDocument();
    // Element exists in doc.elements but is not in any parent's children array
    doc.elements["orphan-el"] = {
      id: "orphan-el",
      type: "Box",
      parentId: null,
      children: [],
      props: {},
      styleIds: [],
    };

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "ORPHANED_ELEMENT")).toBe(true);
  });

  it("detects cyclic tree structure", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;

    doc.elements["el-a"] = {
      id: "el-a",
      type: "Box",
      parentId: rootId,
      children: ["el-b"],
      props: {},
      styleIds: [],
    };
    doc.elements["el-b"] = {
      id: "el-b",
      type: "Box",
      parentId: "el-a",
      children: ["el-a"], // cycle!
      props: {},
      styleIds: [],
    };
    doc.elements[rootId]!.children.push("el-a");

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "CYCLIC_TREE_STRUCTURE")).toBe(true);
  });

  it("detects unknown element types", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;

    doc.elements["el-invalid"] = {
      id: "el-invalid",
      type: "NonExistentWidget",
      parentId: rootId,
      children: [],
      props: {},
      styleIds: [],
    };
    doc.elements[rootId]!.children.push("el-invalid");

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "UNKNOWN_ELEMENT_TYPE")).toBe(true);
  });

  it("detects missing style references", () => {
    const doc = createBlankDocument();
    const pageId = Object.keys(doc.pages)[0]!;
    const rootId = doc.pages[pageId]!.rootId;

    doc.elements[rootId]!.styleIds.push("missing-style-id");

    const result = validateSiteDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_STYLE_REF")).toBe(true);
  });

  it("assertValidSiteDocument throws DocumentValidationError", () => {
    const doc = createBlankDocument();
    delete (doc as any).site;

    expect(() => assertValidSiteDocument(doc)).toThrow(DocumentValidationError);
  });
});
