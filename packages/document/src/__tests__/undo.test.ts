import { describe, it, expect } from "vitest";
import {
  createYDoc,
  yDocToSiteDocument,
  HistoryManager,
  insertElement,
  moveElement,
  deleteElement,
  duplicateElement,
  setProp,
  setStyle,
  resetStyle,
  groupElements,
  ungroupElements,
  addPage,
  updatePage,
  setToken,
  applyAiPatch,
  serializeSubtree,
  pasteSubtree,
  assertValidSiteDocument,
} from "../index.js";

describe("Document Undo / Redo", () => {
  it("undo and redo insertElement", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    history.stopCapturing();
    const secId = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    expect(yDocToSiteDocument(yDoc).elements[secId]).toBeDefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[secId]).toBeUndefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[secId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });

  it("undo and redo moveElement", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const s1 = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const s2 = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    const btn = insertElement(yDoc, { parentId: s1, element: { type: "Button" } });

    history.stopCapturing();
    moveElement(yDoc, { elementId: btn, newParentId: s2, index: 0 });
    expect(yDocToSiteDocument(yDoc).elements[btn]!.parentId).toBe(s2);

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[btn]!.parentId).toBe(s1);
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[btn]!.parentId).toBe(s2);
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });

  it("undo and redo deleteElement", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const btn = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Button" },
      style: { kind: "local", values: {} },
    });
    const styleId = yDocToSiteDocument(yDoc).elements[btn]!.styleIds[0]!;

    history.stopCapturing();
    deleteElement(yDoc, { elementId: btn });
    expect(yDocToSiteDocument(yDoc).elements[btn]).toBeUndefined();
    expect(yDocToSiteDocument(yDoc).styles[styleId]).toBeUndefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[btn]).toBeDefined();
    expect(yDocToSiteDocument(yDoc).styles[styleId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[btn]).toBeUndefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });

  it("undo and redo duplicateElement", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const sec = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });

    history.stopCapturing();
    const dupId = duplicateElement(yDoc, { elementId: sec });
    expect(yDocToSiteDocument(yDoc).elements[dupId]).toBeDefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[dupId]).toBeUndefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[dupId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });

  it("undo and redo setProp", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const btn = insertElement(yDoc, { parentId: bodyId, element: { type: "Button", props: { text: "Original" } } });

    history.stopCapturing();
    setProp(yDoc, { elementId: btn, propName: "text", value: "Updated" });
    expect(yDocToSiteDocument(yDoc).elements[btn]!.props["text"]).toBe("Updated");

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[btn]!.props["text"]).toBe("Original");
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[btn]!.props["text"]).toBe("Updated");
  });

  it("undo and redo setStyle and resetStyle", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const sec = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section" },
      style: { kind: "local", values: {} },
    });
    const styleId = yDocToSiteDocument(yDoc).elements[sec]!.styleIds[0]!;

    history.stopCapturing();
    setStyle(yDoc, {
      styleId,
      breakpoint: "desktop",
      property: "color",
      value: { keyword: "red" },
    });
    expect(yDocToSiteDocument(yDoc).styles[styleId]!.values["desktop"]!["default"]!["color"]).toEqual({
      keyword: "red",
    });

    history.undo();
    expect(yDocToSiteDocument(yDoc).styles[styleId]!.values["desktop"]?.["default"]?.["color"]).toBeUndefined();

    history.redo();
    expect(yDocToSiteDocument(yDoc).styles[styleId]!.values["desktop"]!["default"]!["color"]).toEqual({
      keyword: "red",
    });

    history.stopCapturing();
    resetStyle(yDoc, { styleId, breakpoint: "desktop", property: "color" });
    expect(yDocToSiteDocument(yDoc).styles[styleId]!.values["desktop"]!["default"]!["color"]).toBeUndefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).styles[styleId]!.values["desktop"]!["default"]!["color"]).toEqual({
      keyword: "red",
    });
  });

  it("undo and redo groupElements and ungroupElements", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const e1 = insertElement(yDoc, { parentId: bodyId, element: { type: "Heading" } });
    const e2 = insertElement(yDoc, { parentId: bodyId, element: { type: "Text" } });

    history.stopCapturing();
    const boxId = groupElements(yDoc, { elementIds: [e1, e2] });
    expect(yDocToSiteDocument(yDoc).elements[boxId]).toBeDefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[boxId]).toBeUndefined();
    expect(yDocToSiteDocument(yDoc).elements[e1]!.parentId).toBe(bodyId);
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[boxId]).toBeDefined();
    expect(yDocToSiteDocument(yDoc).elements[e1]!.parentId).toBe(boxId);
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.stopCapturing();
    ungroupElements(yDoc, { containerId: boxId });
    expect(yDocToSiteDocument(yDoc).elements[boxId]).toBeUndefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[boxId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });

  it("undo and redo addPage, updatePage", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);

    history.stopCapturing();
    const pageId = addPage(yDoc, { name: "Blog", slug: "/blog" });
    expect(yDocToSiteDocument(yDoc).pages[pageId]).toBeDefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).pages[pageId]).toBeUndefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).pages[pageId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.stopCapturing();
    updatePage(yDoc, { pageId, updates: { name: "Articles" } });
    expect(yDocToSiteDocument(yDoc).pages[pageId]!.name).toBe("Articles");

    history.undo();
    expect(yDocToSiteDocument(yDoc).pages[pageId]!.name).toBe("Blog");
  });

  it("undo and redo setToken", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);

    history.stopCapturing();
    setToken(yDoc, { category: "colors", key: "color.accent", value: "#00ff00" });
    expect(yDocToSiteDocument(yDoc).tokens.colors["color.accent"]).toBe("#00ff00");

    history.undo();
    expect(yDocToSiteDocument(yDoc).tokens.colors["color.accent"]).toBe("#3b82f6");

    history.redo();
    expect(yDocToSiteDocument(yDoc).tokens.colors["color.accent"]).toBe("#00ff00");
  });

  it("undo and redo applyAiPatch", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    const headingId = insertElement(yDoc, { parentId: bodyId, element: { type: "Heading", props: { text: "Before AI" } } });

    history.stopCapturing();
    applyAiPatch(yDoc, {
      elements: {
        [headingId]: { props: { text: "After AI" } },
      },
    });
    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[headingId]!.props["text"]).toBe("Before AI");
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[headingId]!.props["text"]).toBe("After AI");
  });

  it("undo and redo pasteSubtree", () => {
    const yDoc = createYDoc();
    const history = new HistoryManager(yDoc);
    const bodyId = Object.values(yDocToSiteDocument(yDoc).elements).find((e) => e.type === "Body")!.id;

    history.stopCapturing();
    const secId = insertElement(yDoc, { parentId: bodyId, element: { type: "Section" } });
    insertElement(yDoc, { parentId: secId, element: { type: "Heading", props: { text: "Heading Text" } } });

    const payload = serializeSubtree(yDocToSiteDocument(yDoc), secId);

    history.stopCapturing();
    const pageId = addPage(yDoc, { name: "About", slug: "/about" });
    const aboutBodyId = yDocToSiteDocument(yDoc).pages[pageId]!.rootId;

    history.stopCapturing();
    const pastedId = pasteSubtree(yDoc, { payload, pageRootId: aboutBodyId });
    expect(yDocToSiteDocument(yDoc).elements[pastedId]).toBeDefined();

    history.undo();
    expect(yDocToSiteDocument(yDoc).elements[pastedId]).toBeUndefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));

    history.redo();
    expect(yDocToSiteDocument(yDoc).elements[pastedId]).toBeDefined();
    assertValidSiteDocument(yDocToSiteDocument(yDoc));
  });
});
