import type {
  SiteDocument,
  Page,
  DesignTokens,
  PropValue,
  StyleValue,
  StyleState,
  ClipboardPayload,
  ApplyAiPatchOptions,
} from "@builder/document";
import type * as Y from "yjs";
import type { HistoryManager } from "@builder/document";

export type BreakpointId = "desktop" | "tablet" | "mobile";

export const BREAKPOINT_WIDTHS: Record<BreakpointId, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export type EditorTab = "layers" | "elements" | "pages" | "cms";

export interface DragState {
  isDragging: boolean;
  draggingType?: string | undefined;
  draggingElementId?: string | undefined;
  targetParentId?: string | undefined;
  targetIndex?: number | undefined;
  dropPosition?: "inside" | "before" | "after" | undefined;
}

export interface ResizeState {
  isResizing: boolean;
  elementId?: string | undefined;
  handle?: "top" | "bottom" | "left" | "right" | "bottom-right" | "bottom-left" | undefined;
  initialWidth?: number | undefined;
  initialHeight?: number | undefined;
  currentWidth?: number | undefined;
  currentHeight?: number | undefined;
}

export interface SnapGuide {
  type: "horizontal" | "vertical";
  position: number;
}

export interface EditorState {
  doc: SiteDocument;
  yDoc: Y.Doc | null;
  history: HistoryManager | null;
  selectedId: string | null;
  hoveredId: string | null;
  activePageId: string;
  breakpoint: BreakpointId;
  activeState: StyleState;
  zoom: number;
  previewMode: boolean;
  saveStatus: SaveStatus;
  activeTab: EditorTab;
  activeCmsEntryId: string | null;
  dragState: DragState;
  resizeState: ResizeState;
  guides: SnapGuide[];

  // Action labels for undo/redo
  undoLabel: string | null;
  redoLabel: string | null;

  // Actions
  init: (initialDoc: SiteDocument, yjsStateBase64?: string | null) => void;
  getYjsStateUpdate: () => string;
  selectElement: (id: string | null) => void;
  hoverElement: (id: string | null) => void;
  setBreakpoint: (bp: BreakpointId) => void;
  setActiveState: (state: StyleState) => void;
  setZoom: (zoom: number) => void;
  setPreviewMode: (previewMode: boolean) => void;
  setActivePage: (pageId: string) => void;
  setActiveTab: (tab: EditorTab) => void;
  setActiveCmsEntryId: (id: string | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setDragState: (drag: Partial<DragState>) => void;
  setResizeState: (resize: Partial<ResizeState>) => void;
  setGuides: (guides: SnapGuide[]) => void;

  // Clipboard
  clipboardData: ClipboardPayload | null;
  copyElement: (elementId: string) => Promise<boolean>;
  cutElement: (elementId: string) => Promise<boolean>;
  pasteElement: (targetElementId?: string | undefined, label?: string | undefined) => Promise<string | null>;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Commands
  insertElement: (params: {
    type: string;
    parentId: string;
    index?: number | undefined;
    props?: Record<string, PropValue> | undefined;
    style?: Record<string, StyleValue> | undefined;
    label?: string | undefined;
  }) => string | null;
  moveElement: (
    elementId: string,
    newParentId: string,
    newIndex: number,
    label?: string | undefined
  ) => boolean;
  deleteElement: (elementId: string, label?: string | undefined) => boolean;
  duplicateElement: (elementId: string, label?: string | undefined) => string | null;
  setProp: (
    elementId: string,
    key: string,
    value: PropValue,
    label?: string | undefined
  ) => boolean;
  setStyle: (
    ruleId: string,
    declarations: Record<string, StyleValue>,
    breakpoint?: BreakpointId | undefined,
    state?: StyleState | undefined,
    label?: string | undefined
  ) => boolean;
  addPage: (params: {
    name: string;
    slug: string;
    title?: string | undefined;
    description?: string | undefined;
    label?: string | undefined;
  }) => string | null;
  updatePage: (
    pageId: string,
    patch: Partial<Omit<Page, "id" | "rootId">>,
    label?: string | undefined
  ) => boolean;
  deletePage: (pageId: string, label?: string | undefined) => boolean;
  reorderPages: (pageIds: string[], label?: string | undefined) => boolean;
  toggleElementHidden: (elementId: string) => boolean;
  toggleElementLocked: (elementId: string) => boolean;
  renameElement: (elementId: string, name: string) => boolean;
  setToken: (category: keyof DesignTokens, name: string, value: string) => boolean;
  applyAiPatch: (options: ApplyAiPatchOptions, label?: string | undefined) => boolean;
}
