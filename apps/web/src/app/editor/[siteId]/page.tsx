"use client";

import React, { use, useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { trpc } from "../../../lib/trpc";
import {
  useEditorStore,
  PersistenceManager,
} from "@builder/editor-core";
import { EditorTopBar } from "../../../components/editor/EditorTopBar";
import { EditorLeftPanel } from "../../../components/editor/EditorLeftPanel";
import { EditorCanvas } from "../../../components/editor/EditorCanvas";
import { EditorRightPanel } from "../../../components/editor/EditorRightPanel";
import { PageModal } from "../../../components/editor/PageModal";
import { AiCopilotModal } from "../../../components/ai/AiCopilotModal";
import { PublishModal } from "../../../components/editor/PublishModal";

export default function EditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const resolvedParams = use(params);
  const siteId = resolvedParams.siteId;

  const [isPageModalOpen, setIsPageModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [importReport, setImportReport] = useState<{
    imported: number;
    approximated: number;
    skipped: number;
    warnings: string[];
  } | null>(null);
  const [referenceScreenshot, setReferenceScreenshot] = useState<string | null>(null);
  const [cachedScreenshot, setCachedScreenshot] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<"side-by-side" | "overlay" | "canvas-only">("side-by-side");
  const previousZoomRef = useRef<number>(100);
  const hasInitialized = useRef(false);
  const persistenceRef = useRef<PersistenceManager | null>(null);

  useEffect(() => {
    if (referenceScreenshot && comparisonMode === "side-by-side") {
      previousZoomRef.current = useEditorStore.getState().zoom;
      // Auto zoom-to-fit canvas to prevent squeezing and content clipping in split view
      useEditorStore.getState().setZoom(50);
    } else {
      if (previousZoomRef.current) {
        useEditorStore.getState().setZoom(previousZoomRef.current);
      }
    }
  }, [referenceScreenshot, comparisonMode]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("lastImportReport");
      if (stored) {
        setImportReport(JSON.parse(stored));
        sessionStorage.removeItem("lastImportReport");
      }
    } catch {}

    try {
      const storedShot = sessionStorage.getItem("lastScreenshotRef");
      if (storedShot) {
        setReferenceScreenshot(storedShot);
        setCachedScreenshot(storedShot);
        sessionStorage.removeItem("lastScreenshotRef");
      }
    } catch {}
  }, []);

  const {
    init,
    doc,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedId,
    deleteElement,
    selectElement,
    copyElement,
    cutElement,
    pasteElement,
    setSaveStatus,
  } = useEditorStore();

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.sites.get.useQuery(
    { siteId },
    { enabled: !!siteId, refetchOnWindowFocus: false }
  );

  const saveMutation = trpc.documents.save.useMutation({
    onSuccess: () => {
      setSaveStatus("saved");
      void utils.sites.get.invalidate({ siteId });
    },
    onError: (err) => {
      console.error("[Editor] Failed to save document to server:", err);
      setSaveStatus("error");
    },
  });

  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Initialize store once site document is fetched
  useEffect(() => {
    if (data?.document && !hasInitialized.current) {
      init(data.document, data.yjsState);
      hasInitialized.current = true;
    }
  }, [data?.document, data?.yjsState, init]);

  // Set up Autosave PersistenceManager
  useEffect(() => {
    persistenceRef.current = new PersistenceManager({
      debounceMs: 500,
      onSave: async (docToSave, yjsUpdate) => {
        await saveMutationRef.current.mutateAsync({
          siteId,
          document: docToSave,
          yjsUpdate,
          versionReason: "Autosave",
        });
      },
      onStatusChange: (status) => {
        setSaveStatus(status);
      },
    });

    return () => {
      persistenceRef.current?.destroy();
    };
  }, [siteId, setSaveStatus]);

  // Schedule autosave whenever doc changes after initialization
  useEffect(() => {
    if (hasInitialized.current) {
      const yjsUpdate = useEditorStore.getState().getYjsStateUpdate();
      persistenceRef.current?.scheduleSave(doc, yjsUpdate);
    }
  }, [doc]);

  // Manual save handler
  const handleSaveManual = useCallback(async () => {
    await persistenceRef.current?.flush();
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName) ||
        (e.target as HTMLElement)?.isContentEditable;

      // Undo / Redo
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

      // Copy element
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !isInput && selectedId) {
        e.preventDefault();
        void copyElement(selectedId);
        return;
      }

      // Cut element
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && !isInput && selectedId) {
        e.preventDefault();
        void cutElement(selectedId);
        return;
      }

      // Paste element
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !isInput) {
        e.preventDefault();
        void pasteElement(selectedId ?? undefined);
        return;
      }

      // Escape to deselect
      if (e.key === "Escape") {
        selectElement(null);
        return;
      }

      // Delete element
      if ((e.key === "Delete" || e.key === "Backspace") && !isInput && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canUndo,
    canRedo,
    undo,
    redo,
    selectedId,
    deleteElement,
    selectElement,
    copyElement,
    cutElement,
    pasteElement,
  ]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-neutral-400">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          <span>Loading visual editor...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-900 p-4 text-white">
        <h2 className="text-xl font-bold text-red-400">Failed to load website</h2>
        <p className="mt-2 text-sm text-neutral-400">{error?.message || "Site not found"}</p>
        <Link
          href="/dashboard"
          className="mt-6 rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      {/* 1. Top Bar */}
      <EditorTopBar
        siteName={data.site.name}
        siteId={siteId}
        onSaveManual={handleSaveManual}
        onOpenPageModal={() => setIsPageModalOpen(true)}
        onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
        onOpenPublish={() => setIsPublishOpen(true)}
      />

      {/* Import Report Banner */}
      {importReport && (
        <div
          data-testid="import-report-banner"
          className="flex items-center justify-between border-b border-blue-500/30 bg-blue-950/60 px-4 py-2 text-xs text-blue-200"
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold text-white">Import Report:</span>
            <span>
              {importReport.imported} imported, {importReport.approximated} approximated, {importReport.skipped} skipped
            </span>
            {importReport.warnings && importReport.warnings.length > 0 && (
              <span className="text-amber-300">
                ({importReport.warnings.length} warning{importReport.warnings.length > 1 ? "s" : ""})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {cachedScreenshot && (
              <button
                data-testid="toggle-screenshot-ref-btn"
                onClick={() =>
                  setReferenceScreenshot((prev) => (prev ? null : cachedScreenshot))
                }
                className="rounded bg-blue-900/80 px-2 py-0.5 text-xs text-blue-200 hover:bg-blue-800 hover:text-white transition"
              >
                {referenceScreenshot ? "Hide Screenshot" : "Show Screenshot"}
              </button>
            )}
            <button
              onClick={() => setImportReport(null)}
              className="rounded px-2 py-0.5 text-neutral-400 hover:text-white"
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Workbench Area: Left Panel, Center Canvas, Right Inspector */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Layers Tree & Element Catalog */}
        <EditorLeftPanel siteId={siteId} onOpenPageModal={() => setIsPageModalOpen(true)} />

        {/* Center: Canvas Viewport Frame + Optional Screenshot Comparison View */}
        {referenceScreenshot ? (
          <div data-testid="screenshot-side-by-side" className="relative flex flex-1 overflow-hidden">
            {/* Top comparison mode toolbar */}
            <div className="absolute top-2 right-4 z-40 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/95 px-2 py-1 shadow-xl backdrop-blur">
              <span className="text-[11px] font-medium text-neutral-400">View:</span>
              <div className="flex items-center gap-1 rounded bg-neutral-950 p-0.5 border border-neutral-800 text-xs">
                <button
                  data-testid="comparison-mode-side-by-side"
                  onClick={() => setComparisonMode("side-by-side")}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    comparisonMode === "side-by-side"
                      ? "bg-blue-600 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Side by side
                </button>
                <button
                  data-testid="comparison-mode-overlay"
                  onClick={() => setComparisonMode("overlay")}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    comparisonMode === "overlay"
                      ? "bg-blue-600 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Overlay
                </button>
                <button
                  data-testid="comparison-mode-canvas-only"
                  onClick={() => setComparisonMode("canvas-only")}
                  className={`rounded px-2 py-0.5 text-xs transition ${
                    comparisonMode === "canvas-only"
                      ? "bg-blue-600 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Canvas only
                </button>
              </div>
              <button
                data-testid="close-screenshot-ref-btn"
                onClick={() => setReferenceScreenshot(null)}
                className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
                title="Close screenshot reference"
              >
                ✕ Close
              </button>
            </div>

            {/* Mode 1: Side by side (Split 50/50 evenly with auto zoom-to-fit) */}
            {comparisonMode === "side-by-side" && (
              <div className="flex flex-1 overflow-hidden w-full h-full">
                {/* Uploaded Reference Screenshot Pane (50%) */}
                <div
                  data-testid="screenshot-reference-pane"
                  className="flex w-1/2 flex-1 flex-col border-r border-neutral-800 bg-neutral-950 overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-300">
                    <span className="font-semibold">Original Reference (50%)</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
                    <img
                      src={referenceScreenshot}
                      alt="Original Screenshot Reference"
                      className="max-w-full rounded border border-neutral-800 object-contain shadow-lg"
                    />
                  </div>
                </div>

                {/* Editable Canvas (50%) */}
                <div className="flex w-1/2 flex-1 flex-col overflow-hidden">
                  <EditorCanvas siteId={siteId} />
                </div>
              </div>
            )}

            {/* Mode 2: Overlay Mode */}
            {comparisonMode === "overlay" && (
              <div className="relative flex flex-1 overflow-hidden w-full h-full">
                <div className="flex-1 overflow-hidden">
                  <EditorCanvas siteId={siteId} />
                </div>
                {/* Reference Overlay */}
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-8 opacity-45">
                  <img
                    src={referenceScreenshot}
                    alt="Original Screenshot Reference Overlay"
                    className="max-h-full max-w-full rounded border border-blue-500/30 object-contain shadow-2xl"
                  />
                </div>
              </div>
            )}

            {/* Mode 3: Canvas only Mode */}
            {comparisonMode === "canvas-only" && (
              <div className="flex-1 overflow-hidden w-full h-full">
                <EditorCanvas siteId={siteId} />
              </div>
            )}
          </div>
        ) : (
          <EditorCanvas siteId={siteId} />
        )}

        {/* Right: Inspector for Props & Styles */}
        <EditorRightPanel workspaceId={data.site.workspaceId} siteId={siteId} />
      </div>

      {/* 3. Page Settings & Creation Dialog */}
      <PageModal
        isOpen={isPageModalOpen}
        onClose={() => setIsPageModalOpen(false)}
      />

      {/* 4. AI Copilot Dialog */}
      <AiCopilotModal
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        workspaceId={data.site.workspaceId}
        siteId={siteId}
      />

      {/* 5. Publish & Deployments Dialog */}
      <PublishModal
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        workspaceId={data.site.workspaceId}
        siteId={siteId}
      />
    </div>
  );
}
