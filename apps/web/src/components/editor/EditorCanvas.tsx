"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  useEditorStore,
  BREAKPOINT_WIDTHS,
  calculateAlignmentGuides,
  type SnapGuide,
} from "@builder/editor-core";
import { CanvasPage, compileFullCSS, getGoogleFontsUrl } from "@builder/renderer";
import { trpc } from "../../lib/trpc";

interface SelectedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function EditorCanvas({ siteId }: { siteId?: string }) {
  const {
    doc,
    activePageId,
    activeCmsEntryId,
    setActiveCmsEntryId,
    breakpoint,
    activeState,
    zoom,
    previewMode,
    selectedId,
    selectElement,
    duplicateElement,
    deleteElement,
    copyElement,
    cutElement,
    pasteElement,
    undo,
    redo,
    canUndo,
    canRedo,
    setStyle,
    setProp,
    insertElement,
    moveElement,
  } = useEditorStore();

  const activePage = doc.pages[activePageId];
  const selectedElement = selectedId ? doc.elements[selectedId] : null;

  const templateCollectionId = activePage?.cmsTemplate?.collectionId;
  const cmsListElement = useMemo(
    () => Object.values(doc.elements).find((el) => el.type === "CmsList"),
    [doc.elements]
  );
  const targetCollectionId =
    templateCollectionId || (cmsListElement?.props?.collectionId as string) || "";

  const { data: cmsEntries = [] } = trpc.cms.listEntries.useQuery(
    { siteId: siteId || "", collectionId: targetCollectionId },
    { enabled: !!siteId && !!targetCollectionId }
  );

  const activeCmsEntry = useMemo(() => {
    if (activeCmsEntryId) {
      const match = cmsEntries.find((e) => e.id === activeCmsEntryId);
      if (match) return match;
    }
    return cmsEntries[0] || undefined;
  }, [cmsEntries, activeCmsEntryId]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [iframeMount, setIframeMount] = useState<{
    head: HTMLElement;
    body: HTMLElement;
  } | null>(null);

  // Synchronized overlay states
  const [selectedRect, setSelectedRect] = useState<SelectedRect | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
  const [dropIndicator, setDropIndicator] = useState<{
    targetId: string;
    position: "before" | "after" | "inside";
    rect: SelectedRect;
  } | null>(null);
  const [inlineEditing, setInlineEditing] = useState<{
    elementId: string;
    type: string;
    text: string;
    rect: SelectedRect;
    styles: {
      fontFamily: string;
      fontSize: string;
      fontWeight: string;
      lineHeight: string;
      color: string;
      textAlign: string;
    };
  } | null>(null);

  // Compile CSS from site document tokens, media queries, and style rules
  const googleFontsUrl = useMemo(() => {
    return getGoogleFontsUrl(doc.tokens?.fonts);
  }, [doc.tokens?.fonts]);

  const compiledCSS = useMemo(() => {
    try {
      return compileFullCSS(doc);
    } catch (err) {
      console.warn("[EditorCanvas] CSS compilation warning:", err);
      return "";
    }
  }, [doc]);

  const viewportWidth = BREAKPOINT_WIDTHS[breakpoint];

  // Initialize and attach to iframe document
  const handleIframeLoad = () => {
    if (!iframeRef.current?.contentDocument) return;
    const iDoc = iframeRef.current.contentDocument;
    if (iDoc.head && iDoc.body) {
      // Find or create canvas mount point
      let root = iDoc.getElementById("canvas-root");
      if (!root) {
        root = iDoc.createElement("div");
        root.id = "canvas-root";
        iDoc.body.appendChild(root);
      }
      iDoc.documentElement.setAttribute("data-breakpoint", breakpoint);
      iDoc.body.setAttribute("data-breakpoint", breakpoint);
      root.setAttribute("data-breakpoint", breakpoint);
      setIframeMount({ head: iDoc.head, body: root });
    }
  };

  // Keep data-breakpoint attribute on iframe synced with active editor breakpoint
  useEffect(() => {
    if (!iframeRef.current?.contentDocument) return;
    const iDoc = iframeRef.current.contentDocument;
    iDoc.documentElement?.setAttribute("data-breakpoint", breakpoint);
    iDoc.body?.setAttribute("data-breakpoint", breakpoint);
    const root = iDoc.getElementById("canvas-root");
    if (root) root.setAttribute("data-breakpoint", breakpoint);
  }, [breakpoint, iframeMount]);

  // Re-calculate selected element position inside the iframe
  const updateSelectedRect = useCallback(() => {
    if (!selectedId || !iframeRef.current?.contentDocument) {
      setSelectedRect(null);
      return;
    }
    const iDoc = iframeRef.current.contentDocument;
    const targetEl = iDoc.querySelector(`[data-element-id="${selectedId}"]`) as HTMLElement | null;
    if (!targetEl) {
      setSelectedRect(null);
      return;
    }
    const rect = targetEl.getBoundingClientRect();
    const scrollX = iDoc.defaultView?.scrollX || 0;
    const scrollY = iDoc.defaultView?.scrollY || 0;

    setSelectedRect({
      left: rect.left + scrollX,
      top: rect.top + scrollY,
      width: rect.width,
      height: rect.height,
    });
  }, [selectedId]);

  useEffect(() => {
    updateSelectedRect();
    const interval = setInterval(updateSelectedRect, 200);
    return () => clearInterval(interval);
  }, [updateSelectedRect, doc, breakpoint, zoom]);

  // Window resize & scroll sync inside iframe
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    const win = iframeRef.current.contentWindow;
    win.addEventListener("resize", updateSelectedRect);
    win.addEventListener("scroll", updateSelectedRect);
    return () => {
      win.removeEventListener("resize", updateSelectedRect);
      win.removeEventListener("scroll", updateSelectedRect);
    };
  }, [iframeMount, updateSelectedRect]);

  // Canvas click listener inside iframe to select elements
  useEffect(() => {
    if (!iframeMount?.body) return;
    const iDoc = iframeRef.current?.contentDocument;
    if (!iDoc) return;

    const handleCanvasClick = (e: MouseEvent) => {
      if (previewMode) return;
      const target = (e.target as HTMLElement | null)?.closest("[data-element-id]");
      if (target) {
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag === "a" || tag === "button" || tag === "input") {
          e.preventDefault();
        }
        e.stopPropagation();
        const elId = target.getAttribute("data-element-id");
        if (elId) {
          selectElement(elId);
          return;
        }
      }
      selectElement(null);
    };

    const handleCanvasKeyDown = (e: KeyboardEvent) => {
      const isInput =
        ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName) ||
        (e.target as HTMLElement)?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo()) redo();
        } else {
          if (canUndo()) undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canRedo()) redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !isInput && selectedId) {
        e.preventDefault();
        void copyElement(selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && !isInput && selectedId) {
        e.preventDefault();
        void cutElement(selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !isInput) {
        e.preventDefault();
        void pasteElement(selectedId ?? undefined);
        return;
      }
      if (e.key === "Escape") {
        selectElement(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isInput && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      }
    };

    const handleCanvasDblClick = (e: MouseEvent) => {
      if (previewMode) return;
      const target = (e.target as HTMLElement | null)?.closest("[data-element-id]") as HTMLElement | null;
      if (!target) return;
      const elId = target.getAttribute("data-element-id");
      if (!elId || !doc.elements[elId]) return;
      const el = doc.elements[elId]!;
      if (["Heading", "Text", "Button", "Link"].includes(el.type)) {
        e.preventDefault();
        e.stopPropagation();
        const rect = target.getBoundingClientRect();
        const scrollX = iDoc.defaultView?.scrollX || 0;
        const scrollY = iDoc.defaultView?.scrollY || 0;
        const computed = iDoc.defaultView?.getComputedStyle(target);

        setInlineEditing({
          elementId: elId,
          type: el.type,
          text: String(el.props?.text ?? ""),
          rect: {
            left: rect.left + scrollX,
            top: rect.top + scrollY,
            width: Math.max(rect.width, 100),
            height: Math.max(rect.height, 28),
          },
          styles: {
            fontFamily: computed?.fontFamily || "inherit",
            fontSize: computed?.fontSize || "inherit",
            fontWeight: computed?.fontWeight || "inherit",
            lineHeight: computed?.lineHeight || "inherit",
            color: computed?.color || "inherit",
            textAlign: computed?.textAlign || "left",
          },
        });
      }
    };

    iDoc.addEventListener("click", handleCanvasClick, true);
    iDoc.addEventListener("dblclick", handleCanvasDblClick);
    iDoc.addEventListener("keydown", handleCanvasKeyDown);
    return () => {
      iDoc.removeEventListener("click", handleCanvasClick, true);
      iDoc.removeEventListener("dblclick", handleCanvasDblClick);
      iDoc.removeEventListener("keydown", handleCanvasKeyDown);
    };
  }, [
    iframeMount,
    previewMode,
    selectElement,
    selectedId,
    copyElement,
    cutElement,
    pasteElement,
    deleteElement,
    undo,
    redo,
    canUndo,
    canRedo,
    doc.elements,
  ]);

  // Window-level key listener for clipboard shortcuts across pages
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl?.tagName || "") ||
        activeEl?.isContentEditable;
      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void pasteElement(selectedId ?? undefined);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedId) {
        e.preventDefault();
        void copyElement(selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && selectedId) {
        e.preventDefault();
        void cutElement(selectedId);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo()) redo();
        } else {
          if (canUndo()) undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canRedo()) redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [selectedId, pasteElement, copyElement, cutElement, canRedo, canUndo, redo, undo, deleteElement]);

  // ============================================================================
  // Resize Handles Logic (smooth dragging, min/max limits, snap guides)
  // ============================================================================
  const startResize = (handle: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedRect || !selectedElement) return;

    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = selectedRect.width;
    const startHeight = selectedRect.height;
    const styleId = selectedElement.styleIds[0];

    // Collect sibling boxes for snapping
    const referenceBoxes: Array<{ left: number; top: number; width: number; height: number }> = [];
    if (selectedElement.parentId && iframeRef.current?.contentDocument) {
      const iDoc = iframeRef.current.contentDocument;
      const parentEl = doc.elements[selectedElement.parentId];
      if (parentEl) {
        for (const childId of parentEl.children) {
          if (childId !== selectedElement.id) {
            const siblingEl = iDoc.querySelector(`[data-element-id="${childId}"]`) as HTMLElement | null;
            if (siblingEl) {
              const r = siblingEl.getBoundingClientRect();
              referenceBoxes.push({
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
              });
            }
          }
        }
      }
    }

    let finalWidth = startWidth;
    let finalHeight = startHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / (zoom / 100);
      const deltaY = (moveEvent.clientY - startY) / (zoom / 100);

      let newW = startWidth;
      let newH = startHeight;

      if (handle.includes("right")) {
        newW = Math.max(30, Math.min(viewportWidth, startWidth + deltaX));
      } else if (handle.includes("left")) {
        newW = Math.max(30, Math.min(viewportWidth, startWidth - deltaX));
      }

      if (handle.includes("bottom")) {
        newH = Math.max(20, startHeight + deltaY);
      } else if (handle.includes("top")) {
        newH = Math.max(20, startHeight - deltaY);
      }

      // Check alignment guides
      const targetBox = {
        left: selectedRect.left,
        top: selectedRect.top,
        width: newW,
        height: newH,
      };
      const snapResult = calculateAlignmentGuides(targetBox, referenceBoxes);
      setActiveGuides(snapResult.guides);

      finalWidth = newW;
      finalHeight = newH;

      setSelectedRect({
        ...selectedRect,
        width: newW,
        height: newH,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsResizing(false);
      setActiveGuides([]);

      if (styleId) {
        const declsToUpdate: Record<string, any> = {};
        if (handle.includes("left") || handle.includes("right")) {
          declsToUpdate["width"] = { value: Math.round(finalWidth), unit: "px" };
        }
        if (handle.includes("top") || handle.includes("bottom")) {
          declsToUpdate["height"] = { value: Math.round(finalHeight), unit: "px" };
        }
        setStyle(
          styleId,
          declsToUpdate,
          breakpoint,
          activeState,
          `Resized ${selectedElement.name || selectedElement.type}`
        );
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // ============================================================================
  // Drag and Drop (from Add panel or canvas move)
  // ============================================================================
  const handleIframeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!iframeRef.current?.contentDocument) return;
    const iDoc = iframeRef.current.contentDocument;
    const target = iDoc.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!target) return;

    const targetEl = target.closest("[data-element-id]") as HTMLElement | null;
    if (!targetEl) return;

    const targetId = targetEl.getAttribute("data-element-id");
    if (!targetId || !doc.elements[targetId]) return;

    const element = doc.elements[targetId]!;
    const rect = targetEl.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;

    const isContainer = ["Body", "Section", "Box", "Container", "Form", "Navbar", "CmsList"].includes(element.type);

    let position: "before" | "after" | "inside" = "inside";
    if (isContainer) {
      if (
        selectedId === targetId ||
        element.children.length === 0 ||
        (relativeY >= rect.height * 0.15 && relativeY <= rect.height * 0.85)
      ) {
        position = "inside";
      } else if (relativeY < rect.height * 0.15) {
        position = "before";
      } else {
        position = "after";
      }
    } else {
      position = relativeY < rect.height * 0.5 ? "before" : "after";
    }

    setDropIndicator({
      targetId,
      position,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const handleIframeDragLeave = () => {
    setDropIndicator(null);
  };

  const handleIframeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const elementType = e.dataTransfer.getData("application/builder-element-type");
    const draggedElementId = e.dataTransfer.getData("application/builder-element-id");

    if (!dropIndicator) return;
    const { targetId, position } = dropIndicator;
    const targetElement = doc.elements[targetId];
    if (!targetElement) return;

    let parentId = targetElement.parentId || targetId;
    let index: number | undefined = undefined;

    if (position === "inside") {
      parentId = targetId;
      index = targetElement.children.length;
    } else {
      parentId = targetElement.parentId || activePage?.rootId || "";
      const parent = doc.elements[parentId];
      if (parent) {
        const targetIdx = parent.children.indexOf(targetId);
        index = position === "before" ? targetIdx : targetIdx + 1;
      }
    }

    // Dropping a new element from the Add panel
    if (elementType) {
      let props: Record<string, any> = {};
      if (elementType === "Heading") props = { text: "Heading Text", level: 2 };
      if (elementType === "Text") props = { text: "Add your text here" };
      if (elementType === "Button") props = { text: "Click here", variant: "primary" };
      if (elementType === "Link") props = { text: "Link text", href: "#" };
      if (elementType === "Image") props = { src: "", alt: "Image description" };
      if (elementType === "Input") props = { placeholder: "Enter text...", name: "field" };
      if (elementType === "Textarea") props = { placeholder: "Enter message...", name: "message" };
      if (elementType === "Submit") props = { text: "Submit Form" };

      insertElement({
        type: elementType,
        parentId,
        index,
        props,
      });
    } else if (draggedElementId && draggedElementId !== targetId) {
      // Reordering an existing element on the canvas
      moveElement(draggedElementId, parentId, index ?? 0);
    }

    setDropIndicator(null);
  };

  return (
    <main
      className="relative flex flex-1 flex-col items-center justify-start overflow-auto bg-neutral-900/90 p-8 min-w-0"
      onClick={() => selectElement(null)}
    >
      {/* Floating Toolbar when Element is Selected */}
      {!previewMode && selectedElement && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed top-16 z-30 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 font-mono">
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold">
              {selectedElement.type}
            </span>
            <span className="text-neutral-400 text-[11px]">
              {selectedElement.name || selectedElement.type}
            </span>
            {selectedElement.locked && (
              <span className="text-[10px] text-amber-400 font-sans" title="Element is locked">
                🔒
              </span>
            )}
            {selectedElement.hidden && (
              <span className="text-[10px] text-neutral-500 font-sans" title="Element is hidden">
                👁️‍🗨️
              </span>
            )}
          </div>

          <div className="h-3 w-px bg-neutral-700" />

          {selectedElement.parentId && (
            <button
              onClick={() => selectElement(selectedElement.parentId)}
              className="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
              title="Select Parent Container"
            >
              ↑ Parent
            </button>
          )}

          <button
            onClick={() => duplicateElement(selectedElement.id)}
            disabled={selectedElement.locked}
            className="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40"
            title="Duplicate Element"
          >
            Duplicate
          </button>

          <button
            onClick={() => void copyElement(selectedElement.id)}
            disabled={selectedElement.locked}
            className="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40"
            title="Copy Element (Ctrl+C)"
          >
            Copy
          </button>

          <button
            onClick={() => void pasteElement(selectedElement.id)}
            className="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            title="Paste Element (Ctrl+V)"
          >
            Paste
          </button>

          {/* Alignment controls */}
          <div className="flex items-center gap-0.5 border-l border-neutral-700 pl-1.5">
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { textAlign: { keyword: "left" }, justifyContent: { keyword: "flex-start" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Left"
            >
              Left
            </button>
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { textAlign: { keyword: "center" }, justifyContent: { keyword: "center" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Center"
            >
              Center
            </button>
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { textAlign: { keyword: "right" }, justifyContent: { keyword: "flex-end" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Right"
            >
              Right
            </button>
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { alignItems: { keyword: "flex-start" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Top"
            >
              Top
            </button>
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { alignItems: { keyword: "center" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Middle"
            >
              Mid
            </button>
            <button
              onClick={() => {
                const targetStyleId = selectedElement.styleIds[0];
                if (targetStyleId) {
                  setStyle(targetStyleId, { alignItems: { keyword: "flex-end" } }, breakpoint, activeState);
                }
              }}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-800 hover:text-white text-xs"
              title="Align Bottom"
            >
              Bot
            </button>
          </div>

          {selectedElement.parentId !== null && (
            <button
              onClick={() => deleteElement(selectedElement.id)}
              disabled={selectedElement.locked}
              className="rounded px-2 py-0.5 text-red-400 hover:bg-neutral-800 hover:text-red-300 disabled:opacity-40"
              title="Delete Element"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Breakpoint Viewport Frame */}
      <div
        ref={containerRef}
        style={{
          width: breakpoint === "desktop" ? "100%" : `${viewportWidth}px`,
          maxWidth: `${viewportWidth}px`,
          transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
          transformOrigin: "top center",
          transition: isResizing ? "none" : "width 0.25s ease-in-out",
        }}
        onClick={(e) => e.stopPropagation()}
        className={`relative min-h-[720px] rounded-lg border bg-white text-neutral-900 shadow-2xl transition-all overflow-hidden ${
          previewMode ? "border-transparent" : "border-neutral-800 ring-1 ring-white/10"
        } ${isResizing ? "select-none" : ""}`}
      >
        {/* Dynamic CMS Template Preview Selector Bar */}
        {activePage?.cmsTemplate && cmsEntries.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border border-purple-500/30 bg-neutral-900/95 px-3 py-1 text-xs text-purple-200 shadow-xl backdrop-blur">
            <span className="font-semibold text-purple-400">Dynamic Preview:</span>
            <select
              data-testid="dynamic-preview-entry-select"
              value={activeCmsEntry?.id || ""}
              onChange={(e) => setActiveCmsEntryId(e.target.value)}
              className="bg-transparent text-xs text-white outline-none cursor-pointer"
            >
              {cmsEntries.map((e) => (
                <option key={e.id} value={e.id} className="bg-neutral-900 text-white">
                  {e.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Isolated Canvas Iframe */}
        <iframe
          ref={iframeRef}
          title="Editor Canvas Viewport"
          srcDoc="<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><style>html, body { margin: 0; padding: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing: border-box; } *, *:before, *:after { box-sizing: inherit; } #canvas-root { min-height: 100vh; } :where(a[data-element-type='Button'], button[data-element-type='Button']) { text-decoration: none; }</style></head><body><div id='canvas-root'></div></body></html>"
          onLoad={handleIframeLoad}
          className="w-full h-full min-h-[720px] border-none bg-white block"
        />

        {/* Portaled Content into Iframe Head & Body */}
        {iframeMount && (
          <>
            {createPortal(
              <>
                {googleFontsUrl && (
                  <>
                    <link rel="preconnect" href="https://fonts.googleapis.com" />
                    <link
                      rel="preconnect"
                      href="https://fonts.gstatic.com"
                      crossOrigin="anonymous"
                    />
                    <link rel="stylesheet" href={googleFontsUrl} />
                  </>
                )}
                <style dangerouslySetInnerHTML={{ __html: compiledCSS }} />
                {!previewMode && (
                  <style>{`
                    .is-selected {
                      outline: 2px solid #2563eb !important;
                      outline-offset: -1px !important;
                      position: relative !important;
                    }
                    [data-element-type="Box"]:has(> [data-placeholder="empty-subtle"]):hover,
                    [data-element-type="Section"]:has(> [data-placeholder="empty-subtle"]):hover,
                    [data-element-type="Container"]:has(> [data-placeholder="empty-subtle"]):hover,
                    [data-element-type="Body"]:has(> [data-placeholder="empty-subtle"]):hover {
                      outline: 1px dashed rgba(148, 163, 184, 0.4) !important;
                      outline-offset: -1px !important;
                    }
                    .drop-target-inside {
                      outline: 2px dashed #2563eb !important;
                      outline-offset: -2px !important;
                    }
                    .drop-target-before {
                      box-shadow: 0 -3px 0 0 #2563eb !important;
                    }
                    .drop-target-after {
                      box-shadow: 0 3px 0 0 #2563eb !important;
                    }
                  `}</style>
                )}
              </>,
              iframeMount.head
            )}

            {createPortal(
              <>
                <div
                  className="builder-canvas-wrapper min-h-screen"
                  data-breakpoint={breakpoint}
                  onClick={(e) => {
                    if (previewMode) return;
                    const target = (e.target as HTMLElement | null)?.closest("[data-element-id]");
                    if (target) {
                      const elId = target.getAttribute("data-element-id");
                      if (elId) {
                        e.preventDefault();
                        e.stopPropagation();
                        selectElement(elId);
                        return;
                      }
                    }
                    selectElement(null);
                  }}
                  onDragOver={handleIframeDragOver}
                  onDragLeave={handleIframeDragLeave}
                  onDrop={handleIframeDrop}
                >
                  {activePage ? (
                    <CanvasPage
                      doc={doc}
                      pageId={activePage.id}
                      isEditor={!previewMode}
                      selectedId={selectedId}
                      onSelect={(id) => selectElement(id)}
                      cmsEntry={activeCmsEntry}
                      cmsEntries={cmsEntries}
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-neutral-400">
                      Select or create a page to view canvas.
                    </div>
                  )}
                </div>

                {inlineEditing && (
                  <textarea
                    autoFocus
                    data-testid="inline-text-editor"
                    value={inlineEditing.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInlineEditing((prev) => (prev ? { ...prev, text: val } : null));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        setProp(inlineEditing.elementId, "text", inlineEditing.text);
                        setInlineEditing(null);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setInlineEditing(null);
                      }
                    }}
                    onBlur={() => {
                      if (inlineEditing) {
                        setProp(inlineEditing.elementId, "text", inlineEditing.text);
                        setInlineEditing(null);
                      }
                    }}
                    style={{
                      position: "absolute",
                      left: `${inlineEditing.rect.left}px`,
                      top: `${inlineEditing.rect.top}px`,
                      width: `${inlineEditing.rect.width}px`,
                      minHeight: `${inlineEditing.rect.height}px`,
                      fontFamily: inlineEditing.styles.fontFamily,
                      fontSize: inlineEditing.styles.fontSize,
                      fontWeight: inlineEditing.styles.fontWeight,
                      lineHeight: inlineEditing.styles.lineHeight,
                      color: inlineEditing.styles.color,
                      textAlign: inlineEditing.styles.textAlign as any,
                      background: "rgba(255, 255, 255, 0.98)",
                      border: "2px solid #2563eb",
                      borderRadius: "4px",
                      padding: "2px 4px",
                      outline: "none",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                      zIndex: 99999,
                      resize: "none",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </>,
              iframeMount.body
            )}
          </>
        )}

        {/* Synchronized Selection Overlay, Resize Handles, and Snap Guides */}
        {!previewMode && selectedRect && (
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{ width: "100%", height: "100%" }}
          >
            {/* Selection Highlight Box */}
            <div
              style={{
                position: "absolute",
                left: `${selectedRect.left}px`,
                top: `${selectedRect.top}px`,
                width: `${selectedRect.width}px`,
                height: `${selectedRect.height}px`,
                border: "2px solid #2563eb",
              }}
            >
              {/* Resize Handles (interactive: pointer-events-auto) */}
              {!selectedElement?.locked && (
                <>
                  {/* Top Edge */}
                  <div
                    data-testid="resize-handle-top"
                    onMouseDown={(e) => startResize("top", e)}
                    className="pointer-events-auto absolute -top-3.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-ns-resize"
                  />
                  {/* Bottom Edge */}
                  <div
                    data-testid="resize-handle-bottom"
                    onMouseDown={(e) => startResize("bottom", e)}
                    className="pointer-events-auto absolute -bottom-3.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-ns-resize"
                  />
                  {/* Left Edge */}
                  <div
                    data-testid="resize-handle-left"
                    onMouseDown={(e) => startResize("left", e)}
                    className="pointer-events-auto absolute top-1/2 -left-3.5 -translate-y-1/2 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-ew-resize"
                  />
                  {/* Right Edge */}
                  <div
                    data-testid="resize-handle-right"
                    onMouseDown={(e) => startResize("right", e)}
                    className="pointer-events-auto absolute top-1/2 -right-3.5 -translate-y-1/2 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-ew-resize"
                  />
                  {/* Bottom Right Corner */}
                  <div
                    data-testid="resize-handle-bottom-right"
                    onMouseDown={(e) => startResize("bottom-right", e)}
                    className="pointer-events-auto absolute -bottom-3.5 -right-3.5 h-3.5 w-3.5 rounded-sm border-2 border-blue-600 bg-white shadow-md cursor-nwse-resize"
                  />
                  {/* Bottom Left Corner */}
                  <div
                    data-testid="resize-handle-bottom-left"
                    onMouseDown={(e) => startResize("bottom-left", e)}
                    className="pointer-events-auto absolute -bottom-3.5 -left-3.5 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-nesw-resize"
                  />
                  {/* Top Left Corner */}
                  <div
                    data-testid="resize-handle-top-left"
                    onMouseDown={(e) => startResize("top-left", e)}
                    className="pointer-events-auto absolute -top-3.5 -left-3.5 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-nwse-resize"
                  />
                  {/* Top Right Corner */}
                  <div
                    data-testid="resize-handle-top-right"
                    onMouseDown={(e) => startResize("top-right", e)}
                    className="pointer-events-auto absolute -top-3.5 -right-3.5 h-3 w-3 rounded-sm border border-blue-600 bg-white shadow cursor-nesw-resize"
                  />
                </>
              )}
            </div>

            {/* Active Snap Alignment Lines */}
            {activeGuides.map((guide, idx) => (
              <div
                key={idx}
                style={{
                  position: "absolute",
                  left: guide.type === "vertical" ? `${guide.position}px` : 0,
                  top: guide.type === "horizontal" ? `${guide.position}px` : 0,
                  width: guide.type === "vertical" ? "1px" : "100%",
                  height: guide.type === "horizontal" ? "1px" : "100%",
                  backgroundColor: "#3b82f6",
                  borderStyle: "dashed",
                }}
              />
            ))}
          </div>
        )}

        {/* Drop Indicator (Line above/below or container outline) */}
        {!previewMode && dropIndicator && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: `${dropIndicator.rect.left}px`,
              top:
                dropIndicator.position === "before"
                  ? `${dropIndicator.rect.top - 2}px`
                  : dropIndicator.position === "after"
                  ? `${dropIndicator.rect.top + dropIndicator.rect.height}px`
                  : `${dropIndicator.rect.top}px`,
              width: `${dropIndicator.rect.width}px`,
              height:
                dropIndicator.position === "inside"
                  ? `${dropIndicator.rect.height}px`
                  : "3px",
              backgroundColor:
                dropIndicator.position === "inside" ? "rgba(37, 99, 235, 0.1)" : "#2563eb",
              border:
                dropIndicator.position === "inside" ? "2px dashed #2563eb" : undefined,
            }}
          />
        )}
      </div>
    </main>
  );
}
