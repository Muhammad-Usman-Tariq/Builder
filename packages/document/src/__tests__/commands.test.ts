import { describe, it, expect } from "vitest";
import {
  createYDoc,
  yDocToSiteDocument,
  insertElement,
  moveElement,
  deleteElement,
  duplicateElement,
  setProp,
  setStyle,
  resetStyle,
  groupElements,
  ungroupElements,
  wrapInBox,
  createComponent,
  detachInstance,
  addPage,
  updatePage,
  deletePage,
  setToken,
  applyAiPatch,
  serializeSubtree,
  pasteSubtree,
  assertValidSiteDocument,
} from "../index.js";

describe("Document Commands", () => {
  it("insertElement: inserts child element and style", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sectionId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section", name: "Hero Section" },
      style: { kind: "local", values: { desktop: { default: { padding: { unit: "px", value: 40 } } } } },
    });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[sectionId]).toBeDefined();
    expect(updated.elements[sectionId]!.parentId).toBe(bodyId);
    expect(updated.elements[bodyId]!.children).toContain(sectionId);
    expect(updated.elements[sectionId]!.styleIds.length).toBe(1);
    assertValidSiteDocument(updated);
  });

  it("moveElement: moves element to new parent and index", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const s1 = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const s2 = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const btn = insertElement(yDoc, { parentId: s1, element: { type: "Button", props: { text: "Click" } } });

    moveElement(yDoc, { elementId: btn, newParentId: s2, index: 0 });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[btn]!.parentId).toBe(s2);
    expect(updated.elements[s1]!.children).not.toContain(btn);
    expect(updated.elements[s2]!.children[0]).toBe(btn);
    assertValidSiteDocument(updated);
  });

  it("deleteElement: recursively deletes element, children and local styles", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sectionId = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const btnId = insertElement(yDoc, {
      parentId: sectionId,
      element: { type: "Button" },
      style: { kind: "local", values: {} },
    });

    const btnStyleId = yDocToSiteDocument(yDoc).elements[btnId]!.styleIds[0]!;

    deleteElement(yDoc, { elementId: sectionId });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[sectionId]).toBeUndefined();
    expect(updated.elements[btnId]).toBeUndefined();
    expect(updated.styles[btnStyleId]).toBeUndefined();
    expect(updated.elements[bodyId]!.children).not.toContain(sectionId);
    assertValidSiteDocument(updated);
  });

  it("duplicateElement: deep copies element and descendants with fresh IDs", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sectionId = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    insertElement(yDoc, { parentId: sectionId, element: { type: "Heading", props: { text: "Hello" } } });

    const dupId = duplicateElement(yDoc, { elementId: sectionId });

    const updated = yDocToSiteDocument(yDoc);
    expect(dupId).not.toBe(sectionId);
    expect(updated.elements[dupId]).toBeDefined();
    expect(updated.elements[dupId]!.children.length).toBe(1);
    expect(updated.elements[dupId]!.children[0]).not.toBe(updated.elements[sectionId]!.children[0]);
    assertValidSiteDocument(updated);
  });

  it("setProp: updates element props", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const btnId = insertElement(yDoc, { parentId: bodyId, element: { type: "Button" } });
    setProp(yDoc, { elementId: btnId, propName: "text", value: "Submit Form" });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[btnId]!.props["text"]).toBe("Submit Form");
    assertValidSiteDocument(updated);
  });

  it("setStyle and resetStyle: modifies and clears style declarations", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const elId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section" },
      style: { kind: "local", values: {} },
    });
    const styleId = yDocToSiteDocument(yDoc).elements[elId]!.styleIds[0]!;

    setStyle(yDoc, {
      styleId,
      breakpoint: "desktop",
      state: "default",
      property: "backgroundColor",
      value: { token: "color.primary" },
    });

    let updated = yDocToSiteDocument(yDoc);
    expect(updated.styles[styleId]!.values["desktop"]!["default"]!["backgroundColor"]).toEqual({
      token: "color.primary",
    });

    resetStyle(yDoc, {
      styleId,
      breakpoint: "desktop",
      state: "default",
      property: "backgroundColor",
    });

    updated = yDocToSiteDocument(yDoc);
    expect(updated.styles[styleId]!.values["desktop"]!["default"]!["backgroundColor"]).toBeUndefined();
    assertValidSiteDocument(updated);
  });

  it("groupElements and ungroupElements: wraps siblings into Box and dissolves container", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const e1 = insertElement(yDoc, { parentId: bodyId, element: { type: "Heading" } });
    const e2 = insertElement(yDoc, { parentId: bodyId, element: { type: "Text" } });

    const boxId = groupElements(yDoc, { elementIds: [e1, e2], groupType: "Box" });

    let updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[boxId]).toBeDefined();
    expect(updated.elements[boxId]!.children).toEqual([e1, e2]);
    expect(updated.elements[e1]!.parentId).toBe(boxId);
    expect(updated.elements[e2]!.parentId).toBe(boxId);
    expect(updated.elements[bodyId]!.children).toContain(boxId);
    assertValidSiteDocument(updated);

    ungroupElements(yDoc, { containerId: boxId });

    updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[boxId]).toBeUndefined();
    expect(updated.elements[e1]!.parentId).toBe(bodyId);
    expect(updated.elements[e2]!.parentId).toBe(bodyId);
    assertValidSiteDocument(updated);
  });

  it("wrapInBox: wraps single element in a Box", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const btn = insertElement(yDoc, { parentId: bodyId, element: { type: "Button" } });
    const boxId = wrapInBox(yDoc, { elementId: btn });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[boxId]!.children).toContain(btn);
    expect(updated.elements[btn]!.parentId).toBe(boxId);
    assertValidSiteDocument(updated);
  });

  it("createComponent and detachInstance: manages components", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sec = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const compId = createComponent(yDoc, { elementId: sec, name: "Card Component" });

    let updated = yDocToSiteDocument(yDoc);
    expect(updated.components[compId]).toBeDefined();
    expect(updated.elements[sec]!.instanceOf?.componentId).toBe(compId);
    assertValidSiteDocument(updated);

    detachInstance(yDoc, { elementId: sec });

    updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[sec]!.instanceOf).toBeUndefined();
    assertValidSiteDocument(updated);
  });

  it("addPage, updatePage, and deletePage: manages pages", () => {
    const yDoc = createYDoc();
    const pageId = addPage(yDoc, { name: "About", slug: "/about" });

    let updated = yDocToSiteDocument(yDoc);
    expect(updated.pages[pageId]!.name).toBe("About");
    expect(updated.pages[pageId]!.slug).toBe("/about");
    assertValidSiteDocument(updated);

    updatePage(yDoc, { pageId, updates: { name: "About Us" } });
    updated = yDocToSiteDocument(yDoc);
    expect(updated.pages[pageId]!.name).toBe("About Us");

    deletePage(yDoc, { pageId });
    updated = yDocToSiteDocument(yDoc);
    expect(updated.pages[pageId]).toBeUndefined();
    assertValidSiteDocument(updated);
  });

  it("setToken: updates design tokens", () => {
    const yDoc = createYDoc();
    setToken(yDoc, { category: "colors", key: "color.brand", value: "#ff0000" });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.tokens.colors["color.brand"]).toBe("#ff0000");
    assertValidSiteDocument(updated);
  });

  it("applyAiPatch: atomically updates elements and styles with origin 'ai'", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const headingId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Heading", props: { text: "Old Title" } },
    });

    applyAiPatch(yDoc, {
      elements: {
        [headingId]: { props: { text: "AI Generated Title" } },
      },
    });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[headingId]!.props["text"]).toBe("AI Generated Title");
    expect(updated.elements[headingId]!.origin).toBe("ai");
    assertValidSiteDocument(updated);
  });

  it("applyAiPatch: respects aiLocked and skips modifying locked elements", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const lockedHeadingId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Heading", props: { text: "Protected Title" }, aiLocked: true },
    });

    applyAiPatch(yDoc, {
      elements: {
        [lockedHeadingId]: { props: { text: "Should Not Overwrite" } },
      },
    });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[lockedHeadingId]!.props["text"]).toBe("Protected Title");
    assertValidSiteDocument(updated);
  });

  it("serializeSubtree: serializes an element, all children, and styles into valid clipboard JSON", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sectionId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section", name: "Source Section" },
      style: { kind: "local", values: { desktop: { default: { background: { raw: "#ffffff" } } } } },
    });

    const headingId = insertElement(yDoc, {
      parentId: sectionId,
      element: { type: "Heading", props: { text: "Section Headline" } },
    });

    const buttonId = insertElement(yDoc, {
      parentId: sectionId,
      element: { type: "Button", props: { text: "Learn More" } },
    });

    const currentDoc = yDocToSiteDocument(yDoc);
    const clipboard = serializeSubtree(currentDoc, sectionId);

    expect(clipboard.version).toBe(1);
    expect(clipboard.type).toBe("builder-element-clipboard");
    expect(clipboard.rootElementId).toBe(sectionId);
    expect(Object.keys(clipboard.elements).length).toBe(3);
    expect(clipboard.elements[sectionId]).toBeDefined();
    expect(clipboard.elements[headingId]).toBeDefined();
    expect(clipboard.elements[buttonId]).toBeDefined();
    expect(clipboard.elements[sectionId]!.children).toEqual([headingId, buttonId]);
    expect(Object.keys(clipboard.styles).length).toBeGreaterThanOrEqual(1);
  });

  it("pasteSubtree: inserts subtree into a container with fresh IDs and valid structure", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sourceSectionId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section", name: "Original Section" },
    });

    insertElement(yDoc, {
      parentId: sourceSectionId,
      element: { type: "Heading", props: { text: "Hello Copy" } },
    });

    const currentDoc = yDocToSiteDocument(yDoc);
    const clipboard = serializeSubtree(currentDoc, sourceSectionId);

    const pastedId = pasteSubtree(yDoc, {
      payload: clipboard,
      targetElementId: bodyId,
    });

    const updated = yDocToSiteDocument(yDoc);
    expect(pastedId).not.toBe(sourceSectionId);
    expect(updated.elements[pastedId]).toBeDefined();
    expect(updated.elements[pastedId]!.parentId).toBe(bodyId);
    expect(updated.elements[bodyId]!.children).toContain(pastedId);

    // Children must have fresh IDs
    const pastedChildren = updated.elements[pastedId]!.children;
    expect(pastedChildren.length).toBe(1);
    const pastedChildId = pastedChildren[0]!;
    expect(updated.elements[pastedChildId]!.parentId).toBe(pastedId);
    expect(updated.elements[pastedChildId]!.props["text"]).toBe("Hello Copy");
    assertValidSiteDocument(updated);
  });

  it("pasteSubtree: inserts as sibling after target when target is not a container", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const sectionId = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const heading1 = insertElement(yDoc, { parentId: sectionId, element: { type: "Heading", props: { text: "First" } } });
    const heading2 = insertElement(yDoc, { parentId: sectionId, element: { type: "Heading", props: { text: "Second" } } });

    const btn = insertElement(yDoc, { parentId: sectionId, element: { type: "Button", props: { text: "Copied Button" } } });

    const currentDoc = yDocToSiteDocument(yDoc);
    const clipboard = serializeSubtree(currentDoc, btn);

    // Paste with heading1 selected -> should insert immediately after heading1 (before heading2)
    const pastedBtnId = pasteSubtree(yDoc, {
      payload: clipboard,
      targetElementId: heading1,
    });

    const updated = yDocToSiteDocument(yDoc);
    expect(updated.elements[sectionId]!.children).toEqual([heading1, pastedBtnId, heading2, btn]);
    assertValidSiteDocument(updated);
  });
});
