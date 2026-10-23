"use client";

import React, { useState } from "react";
import {
  useEditorStore,
  getElementEffectiveStyle,
  DISPLAY_OPTIONS,
  FLEX_DIRECTIONS,
  TEXT_ALIGN_OPTIONS,
  BORDER_STYLE_OPTIONS,
} from "@builder/editor-core";
import { MediaPickerModal } from "../media/MediaPickerModal";

export function EditorRightPanel({
  workspaceId,
  siteId,
}: {
  workspaceId?: string;
  siteId?: string;
}) {
  const {
    doc,
    selectedId,
    breakpoint,
    activeState,
    setBreakpoint,
    setActiveState,
    setProp,
    setStyle,
    deleteElement,
    selectElement,
    activePageId,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<"props" | "styles">("props");
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [copiedSiteId, setCopiedSiteId] = useState(false);

  const selectedElement = selectedId ? doc.elements[selectedId] : null;
  const activePage = doc.pages[activePageId];

  if (!selectedElement) {
    return (
      <aside className="flex w-72 select-none flex-col border-l border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300">
        <div className="font-semibold text-neutral-200">Page & Site Settings</div>
        <div className="mt-4 flex flex-col gap-3">
          {siteId && (
            <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
              <div className="font-medium text-white">Site ID</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span data-testid="editor-site-id" className="font-mono text-neutral-300 truncate">
                  {siteId}
                </span>
                <button
                  type="button"
                  data-testid="copy-site-id-btn"
                  onClick={() => {
                    if (navigator?.clipboard?.writeText) {
                      navigator.clipboard.writeText(siteId);
                      setCopiedSiteId(true);
                      setTimeout(() => setCopiedSiteId(false), 2000);
                    }
                  }}
                  className="rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white"
                >
                  {copiedSiteId ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="font-medium text-white">{activePage?.name || "Page"}</div>
            <div className="mt-1 text-neutral-400">Slug: {activePage?.slug}</div>
            <div className="mt-1 text-neutral-400">
              Title: {activePage?.seo?.title || "Default"}
            </div>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
            <div className="font-medium text-white">Design Tokens</div>
            <div className="mt-2 text-neutral-400">
              Heading Font: {doc.tokens.fonts.heading}
            </div>
            <div className="mt-1 text-neutral-400">
              Body Font: {doc.tokens.fonts.body}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {Object.entries(doc.tokens.colors)
                .slice(0, 6)
                .map(([name, hex]) => (
                  <div
                    key={name}
                    className="h-4 w-4 rounded-full border border-neutral-700"
                    style={{ backgroundColor: hex }}
                    title={`${name}: ${hex}`}
                  />
                ))}
            </div>
          </div>

          <div className="text-center text-[11px] text-neutral-500">
            Click on any element in the canvas to inspect its props and styles.
          </div>
        </div>
      </aside>
    );
  }

  const styleId = selectedElement.styleIds[0];
  const effectiveStyles = getElementEffectiveStyle(
    doc,
    selectedElement.id,
    breakpoint,
    activeState
  );
  const decls = effectiveStyles?.declarations || {};

  // Helper to extract string representation from StyleValue
  const getStyleRaw = (prop: string): string => {
    const val = decls[prop];
    if (!val) return "";
    if ("raw" in val) return val.raw;
    if ("keyword" in val) return val.keyword;
    if ("unit" in val) return `${val.value}${val.unit}`;
    if ("token" in val) return val.token;
    return "";
  };

  const handleUpdateStyle = (prop: string, rawValue: string) => {
    let targetStyleId: string = styleId || `s_${selectedElement.id}`;
    if (!styleId) {
      useEditorStore.getState().yDoc?.transact(() => {
        const yStyles = useEditorStore.getState().yDoc!.getMap("styles");
        const yElements = useEditorStore.getState().yDoc!.getMap("elements");
        yStyles.set(targetStyleId, {
          id: targetStyleId,
          kind: "local",
          values: {
            desktop: { default: {} },
          },
        });
        const currEl = yElements.get(selectedElement.id) as any;
        if (currEl) {
          yElements.set(selectedElement.id, {
            ...currEl,
            styleIds: [targetStyleId],
          });
        }
      }, "user");
    }

    if (!rawValue) return;

    let styleVal: any = { raw: rawValue };
    if (/^-?\d+(\.\d+)?(px|%|rem|em|vh|vw)$/.test(rawValue)) {
      const match = rawValue.match(/^(-?\d+(\.\d+)?)(px|%|rem|em|vh|vw)$/);
      if (match && match[1] && match[3]) {
        styleVal = { value: parseFloat(match[1]), unit: match[3] };
      }
    } else if (
      ["block", "flex", "none", "solid", "auto", "transparent", "left", "center", "right"].includes(
        rawValue
      )
    ) {
      styleVal = { keyword: rawValue };
    }

    setStyle(
      targetStyleId,
      { [prop]: styleVal },
      breakpoint,
      activeState,
      `Changed ${prop} (${breakpoint}${activeState !== "default" ? `:${activeState}` : ""})`
    );
  };

  const handlePropChange = (key: string, value: any) => {
    setProp(selectedElement.id, key, value);
  };

  return (
    <aside className="flex w-72 flex-shrink-0 select-none flex-col border-l border-neutral-800 bg-neutral-950 text-xs text-neutral-300">
      {/* Element Header */}
      <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-3">
        <div className="flex items-center gap-1.5 truncate">
          <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {selectedElement.type}
          </span>
          <span className="truncate font-medium text-white">
            {selectedElement.name || selectedElement.type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {selectedElement.parentId !== null && (
            <button
              onClick={() => deleteElement(selectedElement.id)}
              className="rounded p-1 text-red-400 hover:bg-neutral-800 hover:text-red-300"
              title="Delete element"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={() => selectElement(null)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            title="Close inspector"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 bg-neutral-900/60 p-1">
        <button
          onClick={() => setActiveTab("props")}
          className={`flex-1 rounded py-1 font-medium transition-colors ${
            activeTab === "props"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Props
        </button>
        <button
          onClick={() => setActiveTab("styles")}
          className={`flex-1 rounded py-1 font-medium transition-colors ${
            activeTab === "styles"
              ? "bg-neutral-800 text-white"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          Styles
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* PROPS TAB */}
        {activeTab === "props" && (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Element Properties
            </div>

            {/* Element Name */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-neutral-400">Name / Label</label>
              <input
                type="text"
                value={selectedElement.name || ""}
                onChange={(e) => handlePropChange("name", e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            {/* HEADING PROPS */}
            {selectedElement.type === "Heading" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Heading Level</label>
                  <select
                    value={Number(selectedElement.props["level"]) || 2}
                    onChange={(e) => handlePropChange("level", Number(e.target.value))}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    {[1, 2, 3, 4, 5, 6].map((l) => (
                      <option key={l} value={l}>
                        H{l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Heading Text</label>
                  <textarea
                    rows={2}
                    value={String(selectedElement.props["text"] || "")}
                    onChange={(e) => handlePropChange("text", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* TEXT / RICHTEXT PROPS */}
            {(selectedElement.type === "Text" || selectedElement.type === "RichText") && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-neutral-400">Text Content</label>
                <textarea
                  rows={4}
                  value={String(selectedElement.props["text"] || "")}
                  onChange={(e) => handlePropChange("text", e.target.value)}
                  className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* BUTTON / LINK PROPS */}
            {(selectedElement.type === "Button" || selectedElement.type === "Link") && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Button / Link Text</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["text"] || "")}
                    onChange={(e) => handlePropChange("text", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">URL / Target (href)</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["href"] || "#")}
                    onChange={(e) => handlePropChange("href", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                {selectedElement.type === "Button" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-neutral-400">Variant</label>
                    <select
                      value={String(selectedElement.props["variant"] || "primary")}
                      onChange={(e) => handlePropChange("variant", e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="outline">Outline</option>
                      <option value="ghost">Ghost</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {/* IMAGE PROPS */}
            {selectedElement.type === "Image" && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-neutral-400">Image Source (URL)</label>
                    <button
                      type="button"
                      onClick={() => setIsMediaPickerOpen(true)}
                      className="text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      Choose Image...
                    </button>
                  </div>
                  <input
                    type="text"
                    value={String(selectedElement.props["src"] || "")}
                    onChange={(e) => handlePropChange("src", e.target.value)}
                    placeholder="https://..."
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsMediaPickerOpen(true)}
                    className="mt-1 flex items-center justify-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 py-1.5 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
                  >
                    Browse Library / Unsplash
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Alt Text</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["alt"] || "")}
                    onChange={(e) => handlePropChange("alt", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* INPUT / TEXTAREA PROPS */}
            {(selectedElement.type === "Input" || selectedElement.type === "Textarea") && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Placeholder</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["placeholder"] || "")}
                    onChange={(e) => handlePropChange("placeholder", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Field Name</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["name"] || "")}
                    onChange={(e) => handlePropChange("name", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="req-check"
                    checked={Boolean(selectedElement.props["required"])}
                    onChange={(e) => handlePropChange("required", e.target.checked)}
                    className="rounded border-neutral-800 bg-neutral-900 text-blue-600"
                  />
                  <label htmlFor="req-check" className="text-[11px] text-neutral-300">
                    Required field
                  </label>
                </div>
              </>
            )}

            {/* CMS LIST PROPS */}
            {selectedElement.type === "CmsList" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Collection ID / Name</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["collectionId"] || "")}
                    onChange={(e) => handlePropChange("collectionId", e.target.value)}
                    placeholder="e.g. col_12345 or Blog"
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Limit (Max Items)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={Number(selectedElement.props["limit"]) || 6}
                    onChange={(e) => handlePropChange("limit", Number(e.target.value))}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Sort By</label>
                  <select
                    value={String(selectedElement.props["sortBy"] || "createdAt")}
                    onChange={(e) => handlePropChange("sortBy", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="createdAt">Created Date</option>
                    <option value="title">Title</option>
                    <option value="publishedAt">Published Date</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Sort Order</label>
                  <select
                    value={String(selectedElement.props["sortOrder"] || "desc")}
                    onChange={(e) => handlePropChange("sortOrder", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="desc">Descending (Newest first)</option>
                    <option value="asc">Ascending (Oldest first)</option>
                  </select>
                </div>
              </>
            )}

            {/* CMS FIELD PROPS */}
            {selectedElement.type === "CmsField" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Field Key</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["fieldKey"] || "title")}
                    onChange={(e) => handlePropChange("fieldKey", e.target.value)}
                    placeholder="e.g. title, excerpt, content, coverImage"
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Field Type</label>
                  <select
                    value={String(selectedElement.props["fieldType"] || "text")}
                    onChange={(e) => handlePropChange("fieldType", e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  >
                    <option value="text">Text</option>
                    <option value="rich_text">Rich Text (HTML)</option>
                    <option value="image">Image</option>
                    <option value="date">Date</option>
                    <option value="slug">Slug</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-neutral-400">Fallback Text</label>
                  <input
                    type="text"
                    value={String(selectedElement.props["fallback"] || "")}
                    onChange={(e) => handlePropChange("fallback", e.target.value)}
                    placeholder="Optional fallback if empty"
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* STYLES TAB */}
        {activeTab === "styles" && (
          <div className="flex flex-col gap-4">
            {/* Breakpoint & Pseudo State Controls */}
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  Breakpoint
                </span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-blue-400 uppercase">
                  {breakpoint}
                </span>
              </div>
              <div className="flex rounded border border-neutral-800 bg-neutral-950 p-0.5 text-[10px]">
                {(["desktop", "tablet", "mobile"] as const).map((bp) => (
                  <button
                    key={bp}
                    type="button"
                    onClick={() => setBreakpoint(bp)}
                    className={`flex-1 rounded px-2 py-1 font-medium capitalize transition-colors ${
                      breakpoint === bp
                        ? "bg-neutral-800 text-white font-semibold shadow-sm"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {bp}
                  </button>
                ))}
              </div>

              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  State
                </span>
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-purple-400">
                  :{activeState}
                </span>
              </div>
              <div className="flex rounded border border-neutral-800 bg-neutral-950 p-0.5 text-[10px]">
                {(["default", "hover", "focus", "active"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setActiveState(st)}
                    className={`flex-1 rounded px-1.5 py-1 font-medium transition-colors ${
                      activeState === st
                        ? "bg-purple-600 text-white font-semibold shadow-sm"
                        : "text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {st === "default" ? "Default" : `:${st}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Positioning Mode (Free vs Flow) */}
            <div className="flex flex-col gap-2 rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="flex items-center justify-between">
                <div className="font-medium text-neutral-200">Positioning Mode</div>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {getStyleRaw("position") === "absolute" ? "Free" : "Flow"}
                </span>
              </div>
              <div className="flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateStyle("position", "relative");
                  }}
                  className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                    getStyleRaw("position") !== "absolute"
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  Flow (Default)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleUpdateStyle("position", "absolute");
                    if (!getStyleRaw("left")) handleUpdateStyle("left", "0px");
                    if (!getStyleRaw("top")) handleUpdateStyle("top", "0px");
                  }}
                  className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                    getStyleRaw("position") === "absolute"
                      ? "bg-blue-600 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  Free Position
                </button>
              </div>
              {getStyleRaw("position") === "absolute" && (
                <>
                  <div className="rounded border border-amber-900/60 bg-amber-950/30 p-2 text-[11px] text-amber-300">
                    ⚠️ <strong>Warning:</strong> Free positioning can break mobile responsiveness. Flow layout is recommended.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-neutral-400">Left (X)</label>
                      <input
                        type="text"
                        placeholder="0px"
                        data-testid="free-pos-left"
                        value={getStyleRaw("left")}
                        onChange={(e) => handleUpdateStyle("left", e.target.value)}
                        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400">Top (Y)</label>
                      <input
                        type="text"
                        placeholder="0px"
                        data-testid="free-pos-top"
                        value={getStyleRaw("top")}
                        onChange={(e) => handleUpdateStyle("top", e.target.value)}
                        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 1. Layout & Alignment */}
            <div className="flex flex-col gap-2 rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="font-medium text-neutral-200">Layout & Alignment</div>
              <div className="flex flex-col gap-1.5">
                {/* Alignment buttons */}
                <div>
                  <label className="text-[10px] text-neutral-400">Horizontal Alignment</label>
                  <div className="mt-1 flex gap-1">
                    {[
                      { label: "Left", val: "flex-start", textVal: "left" },
                      { label: "Center", val: "center", textVal: "center" },
                      { label: "Right", val: "flex-end", textVal: "right" },
                    ].map((align) => (
                      <button
                        key={align.label}
                        type="button"
                        onClick={() => {
                          handleUpdateStyle("justifyContent", align.val);
                          handleUpdateStyle("textAlign", align.textVal);
                        }}
                        className={`flex-1 rounded border border-neutral-800 py-1 text-xs font-medium transition-colors ${
                          getStyleRaw("justifyContent") === align.val || getStyleRaw("textAlign") === align.textVal
                            ? "bg-neutral-800 text-white border-neutral-700"
                            : "bg-neutral-950 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {align.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-neutral-400">Vertical Alignment</label>
                  <div className="mt-1 flex gap-1">
                    {[
                      { label: "Top", val: "flex-start" },
                      { label: "Middle", val: "center" },
                      { label: "Bottom", val: "flex-end" },
                    ].map((align) => (
                      <button
                        key={align.label}
                        type="button"
                        onClick={() => handleUpdateStyle("alignItems", align.val)}
                        className={`flex-1 rounded border border-neutral-800 py-1 text-xs font-medium transition-colors ${
                          getStyleRaw("alignItems") === align.val
                            ? "bg-neutral-800 text-white border-neutral-700"
                            : "bg-neutral-950 text-neutral-400 hover:text-white"
                        }`}
                      >
                        {align.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="text-[10px] text-neutral-400">Display</label>
                <select
                  value={getStyleRaw("display") || "block"}
                  onChange={(e) => handleUpdateStyle("display", e.target.value)}
                  className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                >
                  {DISPLAY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>

                {getStyleRaw("display") === "flex" && (
                  <>
                    <label className="text-[10px] text-neutral-400">Direction</label>
                    <select
                      value={getStyleRaw("flexDirection") || "row"}
                      onChange={(e) => handleUpdateStyle("flexDirection", e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                    >
                      {FLEX_DIRECTIONS.map((dir) => (
                        <option key={dir} value={dir}>
                          {dir}
                        </option>
                      ))}
                    </select>

                    <label className="text-[10px] text-neutral-400">Gap</label>
                    <input
                      type="text"
                      placeholder="16px"
                      value={getStyleRaw("gap")}
                      onChange={(e) => handleUpdateStyle("gap", e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                    />
                  </>
                )}
              </div>
            </div>

            {/* 2. Spacing */}
            <div className="flex flex-col gap-2 rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="font-medium text-neutral-200">Spacing</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400">Padding Top</label>
                  <input
                    type="text"
                    placeholder="16px"
                    value={getStyleRaw("paddingTop")}
                    onChange={(e) => handleUpdateStyle("paddingTop", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">Padding Bottom</label>
                  <input
                    type="text"
                    placeholder="16px"
                    value={getStyleRaw("paddingBottom")}
                    onChange={(e) => handleUpdateStyle("paddingBottom", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">Margin Top</label>
                  <input
                    type="text"
                    placeholder="0px"
                    value={getStyleRaw("marginTop")}
                    onChange={(e) => handleUpdateStyle("marginTop", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">Margin Bottom</label>
                  <input
                    type="text"
                    placeholder="0px"
                    value={getStyleRaw("marginBottom")}
                    onChange={(e) => handleUpdateStyle("marginBottom", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 3. Typography & Color */}
            <div className="flex flex-col gap-2 rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="font-medium text-neutral-200">Typography & Color</div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-400">Font Size</label>
                    <input
                      type="text"
                      placeholder="16px"
                      value={getStyleRaw("fontSize")}
                      onChange={(e) => handleUpdateStyle("fontSize", e.target.value)}
                      className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">Text Align</label>
                    <select
                      value={getStyleRaw("textAlign") || "left"}
                      onChange={(e) => handleUpdateStyle("textAlign", e.target.value)}
                      className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                    >
                      {TEXT_ALIGN_OPTIONS.map((ta) => (
                        <option key={ta} value={ta}>
                          {ta}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-neutral-400">Text Color</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={getStyleRaw("color") || "#ffffff"}
                        onChange={(e) => handleUpdateStyle("color", e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        placeholder="#ffffff"
                        value={getStyleRaw("color")}
                        onChange={(e) => handleUpdateStyle("color", e.target.value)}
                        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-white outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-400">Background</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={getStyleRaw("backgroundColor") || "#000000"}
                        onChange={(e) => handleUpdateStyle("backgroundColor", e.target.value)}
                        className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        placeholder="#000000"
                        value={getStyleRaw("backgroundColor")}
                        onChange={(e) => handleUpdateStyle("backgroundColor", e.target.value)}
                        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Border & Radius */}
            <div className="flex flex-col gap-2 rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="font-medium text-neutral-200">Border & Radius</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400">Radius</label>
                  <input
                    type="text"
                    placeholder="8px"
                    value={getStyleRaw("borderRadius")}
                    onChange={(e) => handleUpdateStyle("borderRadius", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">Border Width</label>
                  <input
                    type="text"
                    placeholder="1px"
                    value={getStyleRaw("borderWidth")}
                    onChange={(e) => handleUpdateStyle("borderWidth", e.target.value)}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">Border Style</label>
                <select
                  value={getStyleRaw("borderStyle") || "none"}
                  onChange={(e) => handleUpdateStyle("borderStyle", e.target.value)}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none"
                >
                  {BORDER_STYLE_OPTIONS.map((bs) => (
                    <option key={bs} value={bs}>
                      {bs}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedElement && selectedElement.type === "Image" && (
        <MediaPickerModal
          isOpen={isMediaPickerOpen}
          onClose={() => setIsMediaPickerOpen(false)}
          workspaceId={workspaceId || ""}
          onSelectImage={(url, alt) => {
            handlePropChange("src", url);
            if (alt && !selectedElement.props["alt"]) {
              handlePropChange("alt", alt);
            }
          }}
        />
      )}
    </aside>
  );
}
