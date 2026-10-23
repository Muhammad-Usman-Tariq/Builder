import { create } from "zustand";
import {
  siteDocumentToYDoc,
  yDocToSiteDocument,
  encodeYDocState,
  createYDocFromState,
  HistoryManager,
  insertElement as cmdInsertElement,
  moveElement as cmdMoveElement,
  deleteElement as cmdDeleteElement,
  duplicateElement as cmdDuplicateElement,
  serializeSubtree,
  pasteSubtree as cmdPasteSubtree,
  clipboardPayloadSchema,
  type ClipboardPayload,
  setProp as cmdSetProp,
  setStyle as cmdSetStyle,
  addPage as cmdAddPage,
  updatePage as cmdUpdatePage,
  deletePage as cmdDeletePage,
  setToken as cmdSetToken,
  applyAiPatch as cmdApplyAiPatch,
  type ApplyAiPatchOptions,
  createBlankSiteDocument,
  type SiteDocument,
  type Element,
  type CSSDeclarations,
  type Page,
} from "@builder/document";
import type {
  EditorState,
  EditorTab,
  SaveStatus,
  DragState,
  ResizeState,
  SnapGuide,
  BreakpointId,
} from "./types.js";
import type { StyleState } from "@builder/document";

const initialDoc = createBlankSiteDocument();
const initialPageId = Object.keys(initialDoc.pages)[0] ?? "page_home";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

let undoLabelsStack: string[] = [];
let redoLabelsStack: string[] = [];

function recordAction(label: string) {
  undoLabelsStack.push(label);
  redoLabelsStack = [];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: initialDoc,
  yDoc: null,
  history: null,
  selectedId: null,
  hoveredId: null,
  activePageId: initialPageId,
  breakpoint: "desktop",
  activeState: "default",
  zoom: 100,
  previewMode: false,
  saveStatus: "saved",
  activeTab: "layers",
  activeCmsEntryId: null,
  dragState: { isDragging: false },
  resizeState: { isResizing: false },
  guides: [],
  undoLabel: null,
  redoLabel: null,
  clipboardData: null,

  init: (doc: SiteDocument, yjsStateBase64?: string | null) => {
    let yDoc: import("yjs").Doc;
    if (yjsStateBase64) {
      try {
        const binary = base64ToUint8Array(yjsStateBase64);
        yDoc = createYDocFromState(binary);
      } catch (err) {
        console.warn(
          "[EditorStore] Failed to rehydrate from yjsStateBase64, falling back to doc:",
          err
        );
        yDoc = siteDocumentToYDoc(doc);
      }
    } else {
      yDoc = siteDocumentToYDoc(doc);
    }
    const history = new HistoryManager(yDoc);

    const firstPageId =
      Object.entries(doc.pages).find(([, p]) => p.slug === "/")?.[0] ??
      Object.keys(doc.pages)[0] ??
      "page_home";

    undoLabelsStack = [];
    redoLabelsStack = [];

    yDoc.on("update", () => {
      const currentDoc = yDocToSiteDocument(yDoc);
      set((state) => ({
        doc: currentDoc,
        saveStatus: state.saveStatus === "saving" ? "saving" : "unsaved",
        undoLabel: undoLabelsStack[undoLabelsStack.length - 1] ?? null,
        redoLabel: redoLabelsStack[redoLabelsStack.length - 1] ?? null,
      }));
    });

    const activeDoc = yjsStateBase64 ? yDocToSiteDocument(yDoc) : doc;

    set({
      doc: activeDoc,
      yDoc,
      history,
      activePageId: firstPageId,
      selectedId: null,
      hoveredId: null,
      saveStatus: "saved",
      activeState: "default",
      undoLabel: null,
      redoLabel: null,
    });
  },

  getYjsStateUpdate: () => {
    const { yDoc } = get();
    if (!yDoc) return "";
    const binary = encodeYDocState(yDoc);
    return uint8ArrayToBase64(binary);
  },

  selectElement: (id: string | null) => set({ selectedId: id }),
  hoverElement: (id: string | null) => set({ hoveredId: id }),
  setBreakpoint: (breakpoint: BreakpointId) => set({ breakpoint }),
  setActiveState: (activeState: StyleState) => set({ activeState }),
  setZoom: (zoom: number) => set({ zoom }),
  setPreviewMode: (previewMode: boolean) => set({ previewMode }),
  setActivePage: (activePageId: string) =>
    set({
      activePageId,
      selectedId: null,
    }),
  setActiveTab: (activeTab: EditorTab) => set({ activeTab }),
  setActiveCmsEntryId: (activeCmsEntryId: string | null) => set({ activeCmsEntryId }),
  setSaveStatus: (saveStatus: SaveStatus) => set({ saveStatus }),
  setDragState: (drag: Partial<DragState>) =>
    set((state) => ({ dragState: { ...state.dragState, ...drag } })),
  setResizeState: (resize: Partial<ResizeState>) =>
    set((state) => ({ resizeState: { ...state.resizeState, ...resize } })),
  setGuides: (guides: SnapGuide[]) => set({ guides }),

  undo: () => {
    const { history } = get();
    if (history?.canUndo()) {
      const label = undoLabelsStack.pop();
      if (label) redoLabelsStack.push(label);
      history.undo();
      set({
        undoLabel: undoLabelsStack[undoLabelsStack.length - 1] ?? null,
        redoLabel: redoLabelsStack[redoLabelsStack.length - 1] ?? null,
      });
    }
  },

  redo: () => {
    const { history } = get();
    if (history?.canRedo()) {
      const label = redoLabelsStack.pop();
      if (label) undoLabelsStack.push(label);
      history.redo();
      set({
        undoLabel: undoLabelsStack[undoLabelsStack.length - 1] ?? null,
        redoLabel: redoLabelsStack[redoLabelsStack.length - 1] ?? null,
      });
    }
  },

  canUndo: () => get().history?.canUndo() ?? false,
  canRedo: () => get().history?.canRedo() ?? false,

  insertElement: (params) => {
    const { yDoc, history } = get();
    if (!yDoc) return null;
    try {
      history?.stopCapturing();
      const elId = cmdInsertElement(yDoc, {
        parentId: params.parentId,
        index: params.index,
        element: {
          type: params.type,
          props: params.props ?? {},
        },
        style: {
          kind: "local",
          values: {
            desktop: {
              default: (params.style as CSSDeclarations | undefined) ?? {},
            },
          },
        },
      });
      history?.stopCapturing();
      const label = params.label ?? `Added ${params.type}`;
      recordAction(label);
      set({
        selectedId: elId,
        undoLabel: label,
        redoLabel: null,
      });
      return elId;
    } catch (err) {
      console.error("[EditorStore] insertElement error:", err);
      return null;
    }
  },

  moveElement: (elementId, newParentId, newIndex, label) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    try {
      history?.stopCapturing();
      cmdMoveElement(yDoc, { elementId, newParentId, index: newIndex });
      history?.stopCapturing();
      const actionLabel = label ?? `Moved ${el?.name || el?.type || "Element"}`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] moveElement error:", err);
      return false;
    }
  },

  deleteElement: (elementId, label) => {
    const { yDoc, selectedId, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    try {
      history?.stopCapturing();
      cmdDeleteElement(yDoc, { elementId });
      history?.stopCapturing();
      const actionLabel = label ?? `Deleted ${el?.name || el?.type || "Element"}`;
      recordAction(actionLabel);
      set({
        selectedId: selectedId === elementId ? null : selectedId,
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] deleteElement error:", err);
      return false;
    }
  },

  duplicateElement: (elementId, label) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return null;
    const el = doc.elements[elementId];
    try {
      history?.stopCapturing();
      const newId = cmdDuplicateElement(yDoc, { elementId });
      history?.stopCapturing();
      const actionLabel = label ?? `Duplicated ${el?.name || el?.type || "Element"}`;
      recordAction(actionLabel);
      set({
        selectedId: newId,
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return newId;
    } catch (err) {
      console.error("[EditorStore] duplicateElement error:", err);
      return null;
    }
  },

  copyElement: async (elementId: string) => {
    const { doc } = get();
    try {
      const payload = serializeSubtree(doc, elementId);
      set({ clipboardData: payload });
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload));
        } catch {
          // Fallback to in-memory clipboardData if system clipboard API is blocked
        }
      }
      return true;
    } catch (err) {
      console.error("[EditorStore] copyElement error:", err);
      return false;
    }
  },

  cutElement: async (elementId: string) => {
    const { copyElement, deleteElement, doc } = get();
    const el = doc.elements[elementId];
    const success = await copyElement(elementId);
    if (!success) return false;
    deleteElement(elementId, `Cut ${el?.name || el?.type || "Element"}`);
    return true;
  },

  pasteElement: async (targetElementId?: string, label?: string) => {
    const { yDoc, history, doc, activePageId, clipboardData } = get();
    if (!yDoc) return null;

    let payload: ClipboardPayload | null = null;

    // 1. Try reading from system clipboard first
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          const parsed = JSON.parse(text);
          const validated = clipboardPayloadSchema.safeParse(parsed);
          if (validated.success) {
            payload = validated.data;
          }
        }
      } catch {
        // Fallback to in-store clipboardData
      }
    }

    // 2. Fallback to in-memory store clipboard
    if (!payload && clipboardData) {
      payload = clipboardData;
    }

    if (!payload) {
      console.warn("[EditorStore] pasteElement: No valid element data found in clipboard.");
      return null;
    }

    try {
      history?.stopCapturing();
      const activePage = doc.pages[activePageId];
      let effectiveTargetId = targetElementId;
      if (effectiveTargetId && activePage) {
        let curr = doc.elements[effectiveTargetId];
        let reachable = false;
        while (curr) {
          if (curr.id === activePage.rootId) {
            reachable = true;
            break;
          }
          if (!curr.parentId) break;
          curr = doc.elements[curr.parentId];
        }
        if (!reachable) {
          effectiveTargetId = undefined;
        }
      }

      const newRootId = cmdPasteSubtree(yDoc, {
        payload,
        targetElementId: effectiveTargetId,
        pageRootId: activePage?.rootId,
      });
      history?.stopCapturing();

      const sourceRoot = payload.elements[payload.rootElementId];
      const actionLabel = label ?? `Pasted ${sourceRoot?.name || sourceRoot?.type || "Element"}`;
      recordAction(actionLabel);

      set({
        selectedId: newRootId,
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return newRootId;
    } catch (err) {
      console.error("[EditorStore] pasteElement error:", err);
      return null;
    }
  },

  setProp: (elementId, key, value, label) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    try {
      history?.stopCapturing();
      cmdSetProp(yDoc, { elementId, propName: key, value });
      history?.stopCapturing();
      const actionLabel = label ?? `Updated ${key} on ${el?.name || el?.type || "Element"}`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] setProp error:", err);
      return false;
    }
  },

  setStyle: (ruleId, declarations, breakpoint = "desktop", state, label) => {
    const { yDoc, history, activeState } = get();
    if (!yDoc) return false;
    const targetState = state ?? activeState ?? "default";
    try {
      history?.stopCapturing();
      for (const [property, value] of Object.entries(declarations)) {
        cmdSetStyle(yDoc, {
          styleId: ruleId,
          breakpoint,
          state: targetState,
          property,
          value,
        });
      }
      history?.stopCapturing();
      const propsList = Object.keys(declarations).join(", ");
      const actionLabel =
        label ?? `Changed ${propsList} (${breakpoint}${targetState !== "default" ? `:${targetState}` : ""})`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] setStyle error:", err);
      return false;
    }
  },

  addPage: (params) => {
    const { yDoc, history } = get();
    if (!yDoc) return null;
    try {
      history?.stopCapturing();
      const pageId = cmdAddPage(yDoc, {
        name: params.name,
        slug: params.slug,
        seo: {
          title: params.title ?? params.name,
          description: params.description,
        },
      });
      history?.stopCapturing();
      const actionLabel = params.label ?? `Added page "${params.name}"`;
      recordAction(actionLabel);
      set({
        activePageId: pageId,
        selectedId: null,
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return pageId;
    } catch (err) {
      console.error("[EditorStore] addPage error:", err);
      return null;
    }
  },

  updatePage: (pageId, patch, label) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const page = doc.pages[pageId];
    try {
      history?.stopCapturing();
      cmdUpdatePage(yDoc, { pageId, updates: patch });
      history?.stopCapturing();
      const actionLabel = label ?? `Updated page "${page?.name || pageId}"`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] updatePage error:", err);
      return false;
    }
  },

  deletePage: (pageId, label) => {
    const { yDoc, activePageId, doc, history } = get();
    if (!yDoc) return false;
    const page = doc.pages[pageId];
    try {
      history?.stopCapturing();
      cmdDeletePage(yDoc, { pageId });
      history?.stopCapturing();
      const remainingPages = Object.keys(doc.pages).filter((id) => id !== pageId);
      const actionLabel = label ?? `Deleted page "${page?.name || pageId}"`;
      recordAction(actionLabel);
      set({
        activePageId: activePageId === pageId && remainingPages[0] ? remainingPages[0] : activePageId,
        selectedId: null,
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] deletePage error:", err);
      return false;
    }
  },

  reorderPages: (pageIds: string[], label) => {
    const { yDoc, history } = get();
    if (!yDoc) return false;
    try {
      history?.stopCapturing();
      yDoc.transact(() => {
        const yPages = yDoc.getMap("pages");
        const existingPages: Record<string, Page> = {};
        for (const id of pageIds) {
          const p = yPages.get(id) as Page | undefined;
          if (p) existingPages[id] = p;
        }
        for (const [id, p] of Object.entries(existingPages)) {
          yPages.delete(id);
          yPages.set(id, p);
        }
      }, "user");
      history?.stopCapturing();
      const actionLabel = label ?? "Reordered pages";
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] reorderPages error:", err);
      return false;
    }
  },

  toggleElementHidden: (elementId: string) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    if (!el) return false;
    const newHidden = !el.hidden;
    try {
      history?.stopCapturing();
      yDoc.transact(() => {
        const yElements = yDoc.getMap("elements");
        const curr = yElements.get(elementId) as Element | undefined;
        if (curr) {
          yElements.set(elementId, { ...curr, hidden: newHidden });
        }
      }, "user");
      history?.stopCapturing();
      const actionLabel = `${newHidden ? "Hidden" : "Unhid"} ${el.name || el.type}`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] toggleElementHidden error:", err);
      return false;
    }
  },

  toggleElementLocked: (elementId: string) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    if (!el) return false;
    const newLocked = !el.locked;
    try {
      history?.stopCapturing();
      yDoc.transact(() => {
        const yElements = yDoc.getMap("elements");
        const curr = yElements.get(elementId) as Element | undefined;
        if (curr) {
          yElements.set(elementId, { ...curr, locked: newLocked });
        }
      }, "user");
      history?.stopCapturing();
      const actionLabel = `${newLocked ? "Locked" : "Unlocked"} ${el.name || el.type}`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] toggleElementLocked error:", err);
      return false;
    }
  },

  renameElement: (elementId: string, name: string) => {
    const { yDoc, history, doc } = get();
    if (!yDoc) return false;
    const el = doc.elements[elementId];
    if (!el) return false;
    try {
      history?.stopCapturing();
      yDoc.transact(() => {
        const yElements = yDoc.getMap("elements");
        const curr = yElements.get(elementId) as Element | undefined;
        if (curr) {
          yElements.set(elementId, { ...curr, name });
        }
      }, "user");
      history?.stopCapturing();
      const actionLabel = `Renamed ${el.type} to "${name}"`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] renameElement error:", err);
      return false;
    }
  },

  setToken: (category, name, value) => {
    const { yDoc, history } = get();
    if (!yDoc) return false;
    try {
      history?.stopCapturing();
      cmdSetToken(yDoc, { category, key: name, value });
      history?.stopCapturing();
      const actionLabel = `Updated token ${String(category)}.${name}`;
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] setToken error:", err);
      return false;
    }
  },

  applyAiPatch: (options: ApplyAiPatchOptions, label?: string) => {
    const { yDoc, history } = get();
    if (!yDoc) return false;
    try {
      history?.stopCapturing();
      cmdApplyAiPatch(yDoc, options, "ai");
      history?.stopCapturing();
      const actionLabel = label ?? "Applied AI Changes";
      recordAction(actionLabel);
      set({
        undoLabel: actionLabel,
        redoLabel: null,
      });
      return true;
    } catch (err) {
      console.error("[EditorStore] applyAiPatch error:", err);
      return false;
    }
  },
}));
