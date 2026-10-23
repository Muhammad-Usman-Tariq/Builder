"use client";

import React from "react";
import Link from "next/link";
import {
  useEditorStore,
  BREAKPOINT_WIDTHS,
  type BreakpointId,
} from "@builder/editor-core";

import { trpc } from "../../lib/trpc.js";

interface EditorTopBarProps {
  siteName: string;
  siteId?: string;
  onSaveManual?: () => void;
  onOpenPageModal: () => void;
  onOpenAiCopilot?: () => void;
  onOpenPublish?: () => void;
}

export function EditorTopBar({
  siteName,
  siteId,
  onSaveManual,
  onOpenPageModal,
  onOpenAiCopilot,
  onOpenPublish,
}: EditorTopBarProps) {
  const {
    doc,
    activePageId,
    setActivePage,
    breakpoint,
    setBreakpoint,
    zoom,
    setZoom,
    previewMode,
    setPreviewMode,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    saveStatus,
  } = useEditorStore();

  const { data: pubStatus } = trpc.publish.getPublishStatus.useQuery(
    { siteId: siteId || "" },
    { enabled: !!siteId }
  );

  const pages = Object.values(doc.pages);

  return (
    <header className="flex h-14 select-none items-center justify-between border-b border-neutral-800 bg-neutral-950 px-3 text-xs text-neutral-300 min-w-0 overflow-x-auto flex-shrink-0 gap-2">
      {/* Left: Dashboard link, Site Name, Page Switcher */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/dashboard"
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          title="Back to Dashboard"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </Link>

        <div className="h-4 w-px bg-neutral-800" />

        <span className="font-semibold text-white max-w-[140px] truncate" title={siteName}>
          {siteName}
        </span>

        <div className="h-4 w-px bg-neutral-800" />

        {/* Page Selector */}
        <div className="flex items-center gap-1.5">
          <select
            value={activePageId}
            onChange={(e) => setActivePage(e.target.value)}
            className="rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>

          <button
            onClick={onOpenPageModal}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            title="Page Settings / Add Page"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center: Breakpoints Switcher & Zoom */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5">
          {(["desktop", "tablet", "mobile"] as BreakpointId[]).map((bp) => {
            const isActive = breakpoint === bp;
            return (
              <button
                key={bp}
                onClick={() => setBreakpoint(bp)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
                  isActive
                    ? "bg-neutral-800 text-white font-medium"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
                title={`${bp.charAt(0).toUpperCase() + bp.slice(1)} (${BREAKPOINT_WIDTHS[bp]}px)`}
              >
                {bp === "desktop" && (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                {bp === "tablet" && (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                {bp === "mobile" && (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="capitalize">{bp}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom */}
        <select
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none hover:border-neutral-700"
        >
          <option value={50}>50%</option>
          <option value={75}>75%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
        </select>
      </div>

      {/* Right: Undo/Redo, Autosave status, Preview mode */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-r border-neutral-800 pr-3">
          <button
            data-testid="undo-btn"
            onClick={() => undo()}
            disabled={!canUndo()}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
            title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l6-6m-6 6l6 6" />
            </svg>
          </button>
          <button
            data-testid="redo-btn"
            onClick={() => redo()}
            disabled={!canRedo()}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
            title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a5 5 0 00-5 5v2m15-7l-6-6m6 6l-6 6" />
            </svg>
          </button>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-emerald-400" title="All edits saved to database">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Saved
            </span>
          )}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-400" />
              Saving...
            </span>
          )}
          {saveStatus === "unsaved" && (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Unsaved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              Save error
            </span>
          )}
        </div>

        {onSaveManual && (
          <button
            onClick={onSaveManual}
            className="rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700 hover:text-white"
          >
            Save
          </button>
        )}

        {onOpenAiCopilot && (
          <button
            type="button"
            data-testid="copilot-btn"
            onClick={onOpenAiCopilot}
            className="flex items-center gap-1.5 rounded bg-purple-950/60 border border-purple-800/60 px-2.5 py-1 text-xs font-medium text-purple-300 hover:bg-purple-900/60 hover:text-white transition-colors"
            title="Open AI Copilot"
          >
            <span>✦</span>
            <span>Copilot</span>
          </button>
        )}

        {/* Connect AI agent (MCP) */}
        <Link
          href="/mcp"
          target="_blank"
          data-testid="mcp-editor-btn"
          className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors"
          title="Connect AI agent (MCP)"
        >
          <span>🔌</span>
          <span>Connect AI agent (MCP)</span>
        </Link>

        {/* Preview Button */}
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
            previewMode
              ? "bg-blue-600 text-white"
              : "border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white"
          }`}
        >
          {previewMode ? "Exit Preview" : "Preview"}
        </button>

        {/* Publish Button */}
        {onOpenPublish && (
          pubStatus?.isPublished && pubStatus?.isUpToDate ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled
                className="flex items-center gap-1.5 rounded bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-400 cursor-not-allowed border border-neutral-700"
                title="Current draft is identical to live published version"
              >
                <span>✓</span>
                <span>Up to date</span>
              </button>
              <button
                type="button"
                onClick={onOpenPublish}
                className="text-[11px] text-neutral-400 underline hover:text-emerald-400 transition-colors"
                title="Open publish modal to publish anyway"
              >
                Publish anyway
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenPublish}
              className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
              title="Publish site to Vercel"
            >
              <span>▲</span>
              <span>Publish</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}
