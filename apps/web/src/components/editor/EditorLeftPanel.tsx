"use client";

import React, { useState } from "react";
import { useEditorStore, type EditorTab } from "@builder/editor-core";
import { trpc } from "../../lib/trpc";

interface EditorLeftPanelProps {
  siteId?: string;
  onOpenPageModal: () => void;
}

export function EditorLeftPanel({ siteId, onOpenPageModal }: EditorLeftPanelProps) {
  const {
    doc,
    activePageId,
    selectedId,
    selectElement,
    hoveredId,
    hoverElement,
    activeTab,
    setActiveTab,
    insertElement,
    moveElement,
    duplicateElement,
    deleteElement,
    toggleElementHidden,
    toggleElementLocked,
    renameElement,
    reorderPages,
  } = useEditorStore();

  const utils = trpc.useUtils();
  const activePage = doc.pages[activePageId];

  // Inline rename state for layers
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // CMS state
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [cmsSearch, setCmsSearch] = useState("");
  const [cmsStatusFilter, setCmsStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const [newEntryTitle, setNewEntryTitle] = useState("");
  const [newEntrySlug, setNewEntrySlug] = useState("");
  const [newEntryStatus, setNewEntryStatus] = useState<"draft" | "published">("published");
  const [newEntryExcerpt, setNewEntryExcerpt] = useState("");
  const [newEntryContent, setNewEntryContent] = useState("");
  const [newEntryImage, setNewEntryImage] = useState("");
  const [newEntryDate, setNewEntryDate] = useState("");

  // CMS Editing Entry state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryTitle, setEditEntryTitle] = useState("");
  const [editEntrySlug, setEditEntrySlug] = useState("");
  const [editEntryStatus, setEditEntryStatus] = useState<"draft" | "published">("published");
  const [editEntryExcerpt, setEditEntryExcerpt] = useState("");
  const [editEntryContent, setEditEntryContent] = useState("");

  // tRPC queries & mutations for CMS
  const { data: collections = [], isLoading: isLoadingCollections } = trpc.cms.listCollections.useQuery(
    { siteId: siteId || "" },
    { enabled: !!siteId, staleTime: Infinity, refetchOnWindowFocus: false }
  );

  const { data: entries = [], isLoading: isLoadingEntries } = trpc.cms.listEntries.useQuery(
    {
      siteId: siteId || "",
      collectionId: selectedCollectionId || "",
      search: cmsSearch,
      status: cmsStatusFilter,
    },
    {
      enabled: !!siteId && !!selectedCollectionId,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }
  );

  const addSampleBlogMutation = trpc.cms.addSampleBlog.useMutation({
    onSuccess: (res: any) => {
      if (res?.document) {
        useEditorStore.getState().init(res.document);
      }
      if (siteId) {
        void utils.cms.listCollections.invalidate({ siteId });
        void utils.sites.get.invalidate({ siteId });
      }
    },
  });

  const removeSampleBlogMutation = trpc.cms.removeSampleBlog.useMutation({
    onSuccess: (res: any) => {
      if (res?.document) {
        useEditorStore.getState().init(res.document);
      }
      if (siteId) {
        void utils.cms.listCollections.invalidate({ siteId });
        void utils.sites.get.invalidate({ siteId });
      }
      setSelectedCollectionId(null);
    },
  });

  const createCollectionMutation = trpc.cms.createCollection.useMutation({
    onSuccess: () => {
      setNewColName("");
      setIsCreatingCollection(false);
      if (siteId) void utils.cms.listCollections.invalidate({ siteId });
    },
  });

  const deleteCollectionMutation = trpc.cms.deleteCollection.useMutation({
    onSuccess: () => {
      setSelectedCollectionId(null);
      if (siteId) void utils.cms.listCollections.invalidate({ siteId });
    },
  });

  const createEntryMutation = trpc.cms.createEntry.useMutation({
    onSuccess: () => {
      setIsCreatingEntry(false);
      setNewEntryTitle("");
      setNewEntrySlug("");
      setNewEntryExcerpt("");
      setNewEntryContent("");
      setNewEntryImage("");
      setNewEntryDate("");
      if (siteId && selectedCollectionId) {
        void utils.cms.listEntries.invalidate({ siteId, collectionId: selectedCollectionId });
      }
    },
  });

  const updateEntryMutation = trpc.cms.updateEntry.useMutation({
    onSuccess: () => {
      setEditingEntryId(null);
      if (siteId && selectedCollectionId) {
        void utils.cms.listEntries.invalidate({ siteId, collectionId: selectedCollectionId });
      }
    },
  });

  const deleteEntryMutation = trpc.cms.deleteEntry.useMutation({
    onSuccess: () => {
      if (siteId && selectedCollectionId) {
        void utils.cms.listEntries.invalidate({ siteId, collectionId: selectedCollectionId });
      }
    },
  });

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(currentName);
  };

  const commitRename = (id: string) => {
    if (editingName.trim()) {
      renameElement(id, editingName.trim());
    }
    setEditingId(null);
  };

  // Helper to determine parent for direct click insert:
  const getTargetParentId = () => {
    if (selectedId && doc.elements[selectedId]) {
      const el = doc.elements[selectedId]!;
      if (["Body", "Section", "Box", "Container", "Form", "Navbar", "CmsList"].includes(el.type)) {
        return selectedId;
      }
      if (el.parentId) return el.parentId;
    }
    return activePage?.rootId ?? Object.values(doc.elements)[0]?.id ?? "";
  };

  const handleAddElement = (type: string) => {
    const parentId = getTargetParentId();
    if (!parentId) return;

    let props: Record<string, any> = {};
    if (type === "Heading") props = { text: "Heading Text", level: 2 };
    if (type === "Text") props = { text: "Add your text here" };
    if (type === "Button") props = { text: "Click here", variant: "primary" };
    if (type === "Link") props = { text: "Link text", href: "#" };
    if (type === "Image") props = { src: "", alt: "Image description" };
    if (type === "Input") props = { placeholder: "Enter text...", name: "input_field" };
    if (type === "Textarea") props = { placeholder: "Enter message...", name: "message" };
    if (type === "Submit") props = { text: "Submit Form" };
    if (type === "CmsList") {
      props = {
        collectionId: selectedCollectionId || "",
        limit: 6,
        sortBy: "createdAt",
        sortOrder: "desc",
      };
    }
    if (type === "CmsField") {
      props = { fieldKey: "title", fieldType: "text" };
    }

    insertElement({
      type,
      parentId,
      props,
    });
  };

  // Drag-and-drop layer reordering handlers
  const handleLayerDragStart = (id: string, e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/builder-element-id", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleLayerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  };

  const handleLayerDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData("application/builder-element-id");
    if (!draggedId || draggedId === targetId) return;

    const targetEl = doc.elements[targetId];
    const draggedEl = doc.elements[draggedId];
    if (!targetEl || !draggedEl) return;

    if (["Body", "Section", "Box", "Container", "Form", "CmsList"].includes(targetEl.type)) {
      moveElement(draggedId, targetId, targetEl.children.length);
    } else if (targetEl.parentId) {
      const parent = doc.elements[targetEl.parentId];
      if (parent) {
        const idx = parent.children.indexOf(targetId);
        moveElement(draggedId, targetEl.parentId, idx + 1);
      }
    }
  };

  // Recursive element tree item in Layers panel
  const renderLayerItem = (elementId: string, depth = 0) => {
    const element = doc.elements[elementId];
    if (!element) return null;

    const isSelected = selectedId === elementId;
    const isHovered = hoveredId === elementId;
    const isHidden = Boolean(element.hidden);
    const isLocked = Boolean(element.locked);
    const hasChildren = element.children.length > 0;
    const displayName = element.name || element.type;

    return (
      <div key={elementId} className="flex flex-col">
        <div
          draggable={!isLocked && element.parentId !== null}
          onDragStart={(e) => handleLayerDragStart(elementId, e)}
          onDragOver={handleLayerDragOver}
          onDrop={(e) => handleLayerDrop(elementId, e)}
          onClick={(e) => {
            e.stopPropagation();
            selectElement(elementId);
          }}
          onDoubleClick={(e) => startRename(elementId, displayName, e)}
          onMouseEnter={() => hoverElement(elementId)}
          onMouseLeave={() => hoverElement(null)}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
          className={`group flex h-7 cursor-pointer items-center justify-between rounded pr-1.5 text-xs transition-colors ${
            isSelected
              ? "bg-blue-600 text-white font-medium"
              : isHovered
              ? "bg-neutral-800 text-neutral-200"
              : isHidden
              ? "text-neutral-600 hover:text-neutral-400"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
          title="Double click to rename, drag to reorder"
        >
          <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
            <span
              className={`text-[9px] font-mono px-1 rounded ${
                isSelected
                  ? "bg-blue-700 text-blue-100"
                  : "bg-neutral-800/80 text-neutral-500"
              }`}
            >
              {element.type === "Body"
                ? "ROOT"
                : element.type.slice(0, 3).toUpperCase()}
            </span>

            {editingId === elementId ? (
              <input
                autoFocus
                type="text"
                value={editingName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => commitRename(elementId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(elementId);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="h-5 w-32 rounded bg-neutral-900 px-1 text-xs text-white outline-none ring-1 ring-blue-400"
              />
            ) : (
              <span className="truncate">{displayName}</span>
            )}
          </div>

          {element.parentId !== null && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleElementHidden(elementId);
                }}
                className={`rounded p-0.5 transition-colors ${
                  isHidden
                    ? "text-amber-400 hover:text-amber-300"
                    : "text-neutral-500 hover:text-neutral-200 opacity-0 group-hover:opacity-100"
                } ${isSelected ? "opacity-100 text-blue-200" : ""}`}
                title={isHidden ? "Unhide element" : "Hide element"}
              >
                {isHidden ? "🚫" : "👁️"}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleElementLocked(elementId);
                }}
                className={`rounded p-0.5 transition-colors ${
                  isLocked
                    ? "text-amber-400 hover:text-amber-300"
                    : "text-neutral-500 hover:text-neutral-200 opacity-0 group-hover:opacity-100"
                } ${isSelected ? "opacity-100 text-blue-200" : ""}`}
                title={isLocked ? "Unlock element" : "Lock element"}
              >
                {isLocked ? "🔒" : "🔓"}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateElement(elementId);
                }}
                className={`rounded p-0.5 text-neutral-500 hover:text-neutral-200 transition-colors opacity-0 group-hover:opacity-100 ${
                  isSelected ? "opacity-100 text-blue-200" : ""
                }`}
                title="Duplicate layer"
              >
                ❐
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElement(elementId);
                }}
                className={`rounded p-0.5 text-neutral-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 ${
                  isSelected ? "opacity-100 text-blue-200" : ""
                }`}
                title="Delete layer"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {hasChildren && (
          <div className="flex flex-col">
            {element.children.map((childId) => renderLayerItem(childId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const ELEMENT_CATALOG = [
    {
      category: "Layout",
      elements: [
        { type: "Section", label: "Section", desc: "Full-width page section" },
        { type: "Container", label: "Container", desc: "Centered responsive container" },
        { type: "Box", label: "Box", desc: "Generic flex container" },
      ],
    },
    {
      category: "Typography & Content",
      elements: [
        { type: "Heading", label: "Heading", desc: "Title H1-H6" },
        { type: "Text", label: "Text", desc: "Paragraph or inline text" },
        { type: "RichText", label: "Rich Text", desc: "Formatted markdown or HTML text" },
        { type: "Button", label: "Button", desc: "Clickable call to action" },
        { type: "Link", label: "Link", desc: "Hyperlink navigation" },
        { type: "Image", label: "Image", desc: "Responsive media image" },
        { type: "Icon", label: "Icon", desc: "SVG icon symbol" },
      ],
    },
    {
      category: "CMS & Dynamic Data",
      elements: [
        { type: "CmsList", label: "CMS List", desc: "Repeating layout for collection entries" },
        { type: "CmsField", label: "CMS Field", desc: "Dynamic field from current entry" },
      ],
    },
    {
      category: "Interactive & Forms",
      elements: [
        { type: "Navbar", label: "Navbar", desc: "Navigation header bar" },
        { type: "Form", label: "Form", desc: "Submission form wrapper" },
        { type: "Input", label: "Input", desc: "Single line text field" },
        { type: "Textarea", label: "Textarea", desc: "Multi-line text area" },
        { type: "Submit", label: "Submit", desc: "Form submit button" },
      ],
    },
  ];

  // Pages reordering
  const handleMovePage = (pageId: string, direction: "up" | "down") => {
    const pageKeys = Object.keys(doc.pages);
    const currIdx = pageKeys.indexOf(pageId);
    if (currIdx === -1) return;

    const targetIdx = direction === "up" ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= pageKeys.length) return;

    const newKeys = [...pageKeys];
    const [moved] = newKeys.splice(currIdx, 1);
    newKeys.splice(targetIdx, 0, moved!);
    reorderPages(newKeys, `Moved page ${direction}`);
  };

  const selectedCol = collections.find((c) => c.id === selectedCollectionId);

  return (
    <aside className="flex w-64 flex-shrink-0 select-none flex-col border-r border-neutral-800 bg-neutral-950 text-neutral-300">
      {/* Tab Switcher */}
      <div className="flex border-b border-neutral-800 bg-neutral-900/60 p-1">
        {(["layers", "elements", "pages", "cms"] as EditorTab[]).map((tab) => (
          <button
            key={tab}
            data-testid={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded py-1.5 text-xs font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* LAYERS TREE */}
        {activeTab === "layers" && (
          <div className="flex flex-col gap-0.5">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Layers ({activePage?.name || "Page"})
            </div>
            {activePage?.rootId ? (
              renderLayerItem(activePage.rootId)
            ) : (
              <div className="p-4 text-center text-xs text-neutral-500">
                No elements found on this page.
              </div>
            )}
          </div>
        )}

        {/* ADD ELEMENTS */}
        {activeTab === "elements" && (
          <div className="flex flex-col gap-4">
            {ELEMENT_CATALOG.map((group) => (
              <div key={group.category} className="flex flex-col gap-1.5">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  {group.category}
                </div>
                <div className="flex flex-col gap-1">
                  {group.elements.map((item) => (
                    <div
                      key={item.type}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/builder-element-type", item.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => handleAddElement(item.type)}
                      className="group flex cursor-grab active:cursor-grabbing items-center justify-between rounded border border-neutral-800/80 bg-neutral-900/80 px-2.5 py-2 text-left text-xs transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
                      title="Click to insert or drag onto canvas"
                    >
                      <div>
                        <div className="font-medium text-neutral-200 flex items-center gap-1.5">
                          <span>{item.label}</span>
                          <span className="text-[10px] text-neutral-500 font-mono opacity-0 group-hover:opacity-100">
                            drag ⠿
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-500">{item.desc}</div>
                      </div>
                      <span className="text-neutral-500 group-hover:text-blue-400 font-bold">+</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PAGES LIST */}
        {activeTab === "pages" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Pages ({Object.keys(doc.pages).length})
              </span>
              <button
                onClick={onOpenPageModal}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + Add Page
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {Object.values(doc.pages).map((p, idx, arr) => {
                const isActive = p.id === activePageId;
                return (
                  <div
                    key={p.id}
                    onClick={() => useEditorStore.getState().setActivePage(p.id)}
                    className={`group flex cursor-pointer items-center justify-between rounded border px-3 py-2 text-xs transition-colors ${
                      isActive
                        ? "border-blue-500/50 bg-blue-950/30 text-white font-medium"
                        : "border-neutral-800 bg-neutral-900/60 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {p.cmsTemplate && (
                          <span className="rounded bg-purple-900/60 text-purple-300 px-1 text-[9px]">
                            DYNAMIC
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-neutral-500">{p.slug}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(p.id, "up");
                        }}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-neutral-500 hover:text-white disabled:opacity-20"
                        title="Move page up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMovePage(p.id, "down");
                        }}
                        disabled={idx === arr.length - 1}
                        className="rounded p-0.5 text-neutral-500 hover:text-white disabled:opacity-20"
                        title="Move page down"
                      >
                        ▼
                      </button>

                      {isActive && (
                        <span className="ml-1 text-[10px] text-blue-400 font-mono">ACTIVE</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CMS TAB */}
        {activeTab === "cms" && (
          <div className="flex flex-col gap-3">
            {/* Sample Blog Quick Actions */}
            <div className="rounded border border-neutral-800 bg-neutral-900/60 p-2.5 flex flex-col gap-2">
              <div className="text-[11px] font-semibold text-white">Sample Content</div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  data-testid="add-sample-blog-btn"
                  disabled={addSampleBlogMutation.isPending}
                  onClick={() => {
                    if (siteId) {
                      addSampleBlogMutation.mutate({ siteId });
                    }
                  }}
                  className="rounded bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {addSampleBlogMutation.isPending ? "Adding Sample Blog..." : "+ Add sample blog"}
                </button>
                <button
                  type="button"
                  data-testid="remove-sample-blog-btn"
                  disabled={removeSampleBlogMutation.isPending}
                  onClick={() => {
                    if (siteId) {
                      removeSampleBlogMutation.mutate({ siteId });
                    }
                  }}
                  className="rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-50 transition-colors"
                >
                  {removeSampleBlogMutation.isPending ? "Removing..." : "Remove sample content"}
                </button>
              </div>
            </div>

            {/* If NO collection selected: show Collections List */}
            {!selectedCollectionId ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    Collections ({collections.length})
                  </span>
                  <button
                    onClick={() => setIsCreatingCollection(true)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    + New
                  </button>
                </div>

                {isCreatingCollection && (
                  <div className="rounded border border-neutral-700 bg-neutral-900 p-2 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Collection Name (e.g. Products)"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => setIsCreatingCollection(false)}
                        className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!newColName.trim() || createCollectionMutation.isPending}
                        onClick={() => {
                          if (siteId && newColName.trim()) {
                            createCollectionMutation.mutate({
                              siteId,
                              name: newColName.trim(),
                            });
                          }
                        }}
                        className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingCollections ? (
                  <div className="p-4 text-center text-xs text-neutral-500">Loading collections...</div>
                ) : collections.length === 0 ? (
                  <div className="p-4 text-center text-xs text-neutral-500">
                    No CMS collections yet. Click "+ Add sample blog" above to get started.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {collections.map((col) => (
                      <div
                        key={col.id}
                        data-testid={`collection-item-${col.slug}`}
                        onClick={() => setSelectedCollectionId(col.id)}
                        className="group flex cursor-pointer items-center justify-between rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                      >
                        <div>
                          <div className="font-medium text-white">{col.name}</div>
                          <div className="text-[10px] text-neutral-500">
                            /{col.slug} • {col.entryCount} {col.entryCount === 1 ? "entry" : "entries"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete collection "${col.name}"?`)) {
                                if (siteId) deleteCollectionMutation.mutate({ siteId, collectionId: col.id });
                              }
                            }}
                            className="rounded p-0.5 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete collection"
                          >
                            ✕
                          </button>
                          <span className="text-neutral-500 group-hover:text-white">→</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* If collection IS selected: show Entries List & Entry Actions */
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <button
                    onClick={() => {
                      setSelectedCollectionId(null);
                      setEditingEntryId(null);
                      setIsCreatingEntry(false);
                    }}
                    className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                  >
                    ← Collections
                  </button>
                  <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                    {selectedCol?.name}
                  </span>
                </div>

                {/* Entry Search & Filters */}
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="Search entries..."
                    value={cmsSearch}
                    onChange={(e) => setCmsSearch(e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-1">
                    {(["all", "published", "draft"] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setCmsStatusFilter(st)}
                        className={`flex-1 rounded py-0.5 text-[10px] capitalize transition-colors ${
                          cmsStatusFilter === st
                            ? "bg-neutral-800 text-white font-medium"
                            : "text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* New Entry Button */}
                {!isCreatingEntry && !editingEntryId && (
                  <button
                    onClick={() => setIsCreatingEntry(true)}
                    className="rounded border border-dashed border-neutral-700 py-1.5 text-xs text-neutral-300 hover:border-neutral-500 hover:text-white"
                  >
                    + New Entry
                  </button>
                )}

                {/* Create Entry Form */}
                {isCreatingEntry && (
                  <div className="rounded border border-neutral-700 bg-neutral-900 p-2.5 flex flex-col gap-2">
                    <div className="text-[11px] font-semibold text-white">New {selectedCol?.name} Entry</div>
                    <input
                      type="text"
                      placeholder="Title"
                      value={newEntryTitle}
                      onChange={(e) => {
                        setNewEntryTitle(e.target.value);
                        setNewEntrySlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                      }}
                      className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="Slug"
                      value={newEntrySlug}
                      onChange={(e) => setNewEntrySlug(e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <textarea
                      placeholder="Excerpt / Summary"
                      rows={2}
                      value={newEntryExcerpt}
                      onChange={(e) => setNewEntryExcerpt(e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <textarea
                      placeholder="Rich content (HTML)"
                      rows={3}
                      value={newEntryContent}
                      onChange={(e) => setNewEntryContent(e.target.value)}
                      className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newEntryStatus}
                        onChange={(e) => setNewEntryStatus(e.target.value as any)}
                        className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-white outline-none"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                      <div className="flex-1 flex justify-end gap-1">
                        <button
                          onClick={() => setIsCreatingEntry(false)}
                          className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={!newEntryTitle.trim() || createEntryMutation.isPending}
                          onClick={() => {
                            if (siteId && selectedCollectionId && newEntryTitle.trim()) {
                              createEntryMutation.mutate({
                                siteId,
                                collectionId: selectedCollectionId,
                                title: newEntryTitle.trim(),
                                slug: newEntrySlug.trim(),
                                status: newEntryStatus,
                                data: {
                                  title: newEntryTitle.trim(),
                                  slug: newEntrySlug.trim(),
                                  excerpt: newEntryExcerpt,
                                  content: newEntryContent,
                                  coverImage: newEntryImage,
                                  publishedAt: newEntryDate || new Date().toISOString().split("T")[0],
                                },
                              });
                            }
                          }}
                          className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit Entry Inline Modal */}
                {editingEntryId && (
                  <div className="rounded border border-blue-600/50 bg-neutral-900 p-2.5 flex flex-col gap-2">
                    <div className="text-[11px] font-semibold text-blue-300">Edit Post Title & Content</div>
                    <div>
                      <label className="text-[10px] text-neutral-400">Post Title</label>
                      <input
                        type="text"
                        data-testid="edit-entry-title-input"
                        value={editEntryTitle}
                        onChange={(e) => setEditEntryTitle(e.target.value)}
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500 mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400">Slug</label>
                      <input
                        type="text"
                        value={editEntrySlug}
                        onChange={(e) => setEditEntrySlug(e.target.value)}
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white outline-none focus:border-blue-500 mt-0.5"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400">Status</label>
                      <select
                        value={editEntryStatus}
                        onChange={(e) => setEditEntryStatus(e.target.value as any)}
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white outline-none mt-0.5"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-1 mt-1">
                      <button
                        onClick={() => setEditingEntryId(null)}
                        className="rounded px-2 py-1 text-xs text-neutral-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        data-testid="save-entry-btn"
                        disabled={!editEntryTitle.trim() || updateEntryMutation.isPending}
                        onClick={() => {
                          if (siteId && editingEntryId) {
                            updateEntryMutation.mutate({
                              siteId,
                              entryId: editingEntryId,
                              title: editEntryTitle.trim(),
                              slug: editEntrySlug.trim(),
                              status: editEntryStatus,
                              data: {
                                title: editEntryTitle.trim(),
                                slug: editEntrySlug.trim(),
                                excerpt: editEntryExcerpt,
                                content: editEntryContent,
                              },
                            });
                          }
                        }}
                        className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}

                {/* Entries List */}
                {isLoadingEntries ? (
                  <div className="p-4 text-center text-xs text-neutral-500">Loading entries...</div>
                ) : entries.length === 0 ? (
                  <div className="p-4 text-center text-xs text-neutral-500">
                    No entries found matching filters.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
                    {entries.map((ent) => (
                      <div
                        key={ent.id}
                        data-testid={`entry-item-${ent.slug}`}
                        className="group flex items-center justify-between rounded border border-neutral-800 bg-neutral-900/60 p-2 text-xs transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                      >
                        <div className="truncate flex-1 min-w-0 pr-1">
                          <div
                            className="font-medium text-white truncate cursor-pointer hover:text-blue-400"
                            onClick={() => {
                              setEditingEntryId(ent.id);
                              setEditEntryTitle(ent.title);
                              setEditEntrySlug(ent.slug);
                              setEditEntryStatus(ent.status as any);
                              setEditEntryExcerpt(ent.data?.excerpt || "");
                              setEditEntryContent(ent.data?.content || "");
                            }}
                          >
                            {ent.title}
                          </div>
                          <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                            <span>/{ent.slug}</span>
                            <span>•</span>
                            <span
                              className={
                                ent.status === "published"
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }
                            >
                              {ent.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`edit-entry-btn-${ent.slug}`}
                            onClick={() => {
                              setEditingEntryId(ent.id);
                              setEditEntryTitle(ent.title);
                              setEditEntrySlug(ent.slug);
                              setEditEntryStatus(ent.status as any);
                              setEditEntryExcerpt(ent.data?.excerpt || "");
                              setEditEntryContent(ent.data?.content || "");
                            }}
                            className="rounded p-1 text-neutral-400 hover:text-white"
                            title="Edit entry"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete entry "${ent.title}"?`)) {
                                if (siteId) deleteEntryMutation.mutate({ siteId, entryId: ent.id });
                              }
                            }}
                            className="rounded p-1 text-neutral-500 hover:text-red-400"
                            title="Delete entry"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
