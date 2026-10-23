import { describe, it, expect, beforeEach } from "vitest";
import { createBlankSiteDocument } from "@builder/document";
import {
  useEditorStore,
  getElementEffectiveStyle,
  snapCoordinate,
  calculateAlignmentGuides,
  PersistenceManager,
} from "../index.js";

describe("Milestone M5: @builder/editor-core Store and Utilities", () => {
  let homePageId: string;

  beforeEach(() => {
    const blankDoc = createBlankSiteDocument();
    homePageId = Object.keys(blankDoc.pages)[0]!;
    useEditorStore.getState().init(blankDoc);
  });

  it("initializes store with blank site document and root element", () => {
    const state = useEditorStore.getState();
    expect(state.doc).toBeDefined();
    expect(state.activePageId).toBe(homePageId);
    expect(state.selectedId).toBeNull();
    expect(state.saveStatus).toBe("saved");
    expect(state.breakpoint).toBe("desktop");
  });

  it("manages selection, hover, and breakpoint state", () => {
    const { selectElement, hoverElement, setBreakpoint, setPreviewMode } =
      useEditorStore.getState();

    selectElement("elem_root");
    expect(useEditorStore.getState().selectedId).toBe("elem_root");

    hoverElement("elem_root");
    expect(useEditorStore.getState().hoveredId).toBe("elem_root");

    setBreakpoint("tablet");
    expect(useEditorStore.getState().breakpoint).toBe("tablet");

    setPreviewMode(true);
    expect(useEditorStore.getState().previewMode).toBe(true);
  });

  it("inserts elements via commands and updates Yjs document & selection", () => {
    const state = useEditorStore.getState();
    const homePage = state.doc.pages[homePageId]!;

    const insertedId = state.insertElement({
      type: "Heading",
      parentId: homePage.rootId,
      props: { text: "Hello World", level: 1 },
    });

    expect(insertedId).toBeDefined();
    const updatedState = useEditorStore.getState();
    expect(updatedState.selectedId).toBe(insertedId);
    expect(updatedState.doc.elements[insertedId!]).toBeDefined();
    expect(updatedState.doc.elements[insertedId!]?.type).toBe("Heading");
    expect(updatedState.doc.elements[insertedId!]?.props["text"]).toBe("Hello World");
    expect(updatedState.saveStatus).toBe("unsaved");
  });

  it("updates element props and supports undo / redo", () => {
    const state = useEditorStore.getState();
    const homePage = state.doc.pages[homePageId]!;

    const elemId = state.insertElement({
      type: "Button",
      parentId: homePage.rootId,
      props: { text: "Submit", variant: "primary" },
    })!;

    expect(useEditorStore.getState().doc.elements[elemId]?.props["text"]).toBe("Submit");

    // Edit prop
    state.setProp(elemId, "text", "Click Me");
    expect(useEditorStore.getState().doc.elements[elemId]?.props["text"]).toBe("Click Me");

    // Undo
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().doc.elements[elemId]?.props["text"]).toBe("Submit");

    // Redo
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().doc.elements[elemId]?.props["text"]).toBe("Click Me");
  });

  it("updates element styles across desktop and mobile breakpoints", () => {
    const state = useEditorStore.getState();
    const homePage = state.doc.pages[homePageId]!;

    const elemId = state.insertElement({
      type: "Box",
      parentId: homePage.rootId,
    })!;

    const element = useEditorStore.getState().doc.elements[elemId]!;
    const styleId = element.styleIds[0]!;

    // Set desktop background
    state.setStyle(styleId, { backgroundColor: { raw: "#ff0000" } }, "desktop");

    // Set mobile background override
    state.setStyle(styleId, { backgroundColor: { raw: "#0000ff" } }, "mobile");

    const desktopResolved = getElementEffectiveStyle(
      useEditorStore.getState().doc,
      elemId,
      "desktop"
    );
    expect(desktopResolved?.declarations["backgroundColor"]).toEqual({
      raw: "#ff0000",
    });

    const mobileResolved = getElementEffectiveStyle(
      useEditorStore.getState().doc,
      elemId,
      "mobile"
    );
    expect(mobileResolved?.declarations["backgroundColor"]).toEqual({
      raw: "#0000ff",
    });
  });

  it("duplicates and deletes elements with selection synchronization", () => {
    const state = useEditorStore.getState();
    const homePage = state.doc.pages[homePageId]!;

    const elemId = state.insertElement({
      type: "Heading",
      parentId: homePage.rootId,
      props: { text: "Original" },
    })!;

    const dupId = state.duplicateElement(elemId);
    expect(dupId).toBeDefined();
    expect(useEditorStore.getState().selectedId).toBe(dupId);
    expect(useEditorStore.getState().doc.elements[dupId!]?.props["text"]).toBe("Original");

    // Delete duplicated element
    const deleted = state.deleteElement(dupId!);
    expect(deleted).toBe(true);
    expect(useEditorStore.getState().doc.elements[dupId!]).toBeUndefined();
    expect(useEditorStore.getState().selectedId).toBeNull();
  });

  it("adds, updates, and switches active pages", () => {
    const state = useEditorStore.getState();

    const newPageId = state.addPage({
      name: "About Us",
      slug: "/about",
      title: "About Our Company",
      description: "Learn more about us",
    })!;

    expect(newPageId).toBeDefined();
    expect(useEditorStore.getState().activePageId).toBe(newPageId);
    expect(useEditorStore.getState().doc.pages[newPageId]?.name).toBe("About Us");

    // Update page
    state.updatePage(newPageId, { name: "Company Story" });
    expect(useEditorStore.getState().doc.pages[newPageId]?.name).toBe("Company Story");

    // Switch back to home
    state.setActivePage(homePageId);
    expect(useEditorStore.getState().activePageId).toBe(homePageId);
  });

  it("handles persistence manager debounced saves and flushes", async () => {
    let savedDocsCount = 0;
    const persistence = new PersistenceManager({
      debounceMs: 50,
      onSave: async () => {
        savedDocsCount++;
      },
    });

    const doc = useEditorStore.getState().doc;
    persistence.scheduleSave(doc);
    expect(savedDocsCount).toBe(0);

    // Flush immediately
    await persistence.flush();
    expect(savedDocsCount).toBe(1);

    persistence.destroy();
  });

  it("calculates snap coordinates and alignment guides correctly", () => {
    // 8px grid snap
    const snap1 = snapCoordinate(15);
    expect(snap1.snapped).toBe(16);

    // Snap to specific guide
    const snap2 = snapCoordinate(102, [100]);
    expect(snap2.snapped).toBe(100);

    // Box alignment
    const target = { left: 101, top: 200, width: 50, height: 50 };
    const ref = { left: 100, top: 300, width: 50, height: 50 };
    const { snappedLeft, guides } = calculateAlignmentGuides(target, [ref]);

    expect(snappedLeft).toBe(100);
    expect(guides.some((g) => g.type === "vertical" && g.position === 100)).toBe(true);
  });

  it("handles copy, paste, cut, and undo in editor store", async () => {
    const state = useEditorStore.getState();
    const homePage = state.doc.pages[homePageId]!;

    const sectionId = state.insertElement({
      type: "Section",
      parentId: homePage.rootId,
      props: { name: "TestSection" },
    })!;

    const headingId = state.insertElement({
      type: "Heading",
      parentId: sectionId,
      props: { text: "Copy Me" },
    })!;

    // Copy section with children
    const copied = await useEditorStore.getState().copyElement(sectionId);
    expect(copied).toBe(true);
    expect(useEditorStore.getState().clipboardData).toBeDefined();
    expect(useEditorStore.getState().clipboardData?.elements[headingId]).toBeDefined();

    // Paste
    const pastedRootId = await useEditorStore.getState().pasteElement(homePage.rootId);
    expect(pastedRootId).toBeDefined();
    expect(pastedRootId).not.toBe(sectionId);

    const docAfterPaste = useEditorStore.getState().doc;
    expect(docAfterPaste.elements[pastedRootId!]).toBeDefined();
    expect(docAfterPaste.elements[pastedRootId!]?.children.length).toBe(1);

    // Undo paste in one step
    expect(useEditorStore.getState().canUndo()).toBe(true);
    expect(useEditorStore.getState().undoLabel).toContain("Pasted");
    useEditorStore.getState().undo();

    const docAfterUndo = useEditorStore.getState().doc;
    expect(docAfterUndo.elements[pastedRootId!]).toBeUndefined();

    // Redo paste
    expect(useEditorStore.getState().canRedo()).toBe(true);
    useEditorStore.getState().redo();

    const docAfterRedo = useEditorStore.getState().doc;
    expect(docAfterRedo.elements[pastedRootId!]).toBeDefined();
  });
});
