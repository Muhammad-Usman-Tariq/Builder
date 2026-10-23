"use client";

import React, { useState } from "react";
import { useEditorStore } from "@builder/editor-core";

interface PageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PageModal({ isOpen, onClose }: PageModalProps) {
  const { doc, activePageId, addPage, updatePage, deletePage } = useEditorStore();

  const [mode, setMode] = useState<"settings" | "add">("settings");

  // Form fields for active page settings
  const activePage = doc.pages[activePageId];
  const [name, setName] = useState(activePage?.name || "");
  const [slug, setSlug] = useState(activePage?.slug || "/");
  const [seoTitle, setSeoTitle] = useState(activePage?.seo?.title || "");
  const [seoDescription, setSeoDescription] = useState(activePage?.seo?.description || "");

  // Form fields for new page
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newSeoTitle, setNewSeoTitle] = useState("");
  const [newSeoDesc, setNewSeoDesc] = useState("");

  if (!isOpen) return null;

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePageId) return;

    updatePage(activePageId, {
      name,
      slug: slug.startsWith("/") ? slug : `/${slug}`,
      seo: {
        title: seoTitle,
        description: seoDescription,
      },
    });
    onClose();
  };

  const handleCreatePage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;

    addPage({
      name: newName.trim(),
      slug: newSlug.startsWith("/") ? newSlug.trim() : `/${newSlug.trim()}`,
      title: newSeoTitle.trim() || newName.trim(),
      description: newSeoDesc.trim() || undefined,
    });

    setNewName("");
    setNewSlug("");
    setNewSeoTitle("");
    setNewSeoDesc("");
    onClose();
  };

  const handleDeletePage = () => {
    if (Object.keys(doc.pages).length <= 1) {
      alert("Cannot delete the only page of a website.");
      return;
    }
    if (confirm(`Are you sure you want to delete "${activePage?.name}"?`)) {
      deletePage(activePageId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("settings")}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                mode === "settings"
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Page Settings
            </button>
            <button
              onClick={() => setMode("add")}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                mode === "add"
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              + New Page
            </button>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* SETTINGS MODE */}
        {mode === "settings" && (
          <form onSubmit={handleSaveSettings} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">Page Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">URL Slug</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">SEO Title</label>
              <input
                type="text"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">SEO Description</label>
              <textarea
                rows={3}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleDeletePage}
                disabled={Object.keys(doc.pages).length <= 1}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
              >
                Delete Page
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ADD MODE */}
        {mode === "add" && (
          <form onSubmit={handleCreatePage} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">Page Name</label>
              <input
                type="text"
                required
                placeholder="e.g. About, Pricing, Contact"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug || newSlug === `/${newName.toLowerCase().replace(/\s+/g, "-")}`) {
                    setNewSlug(`/${e.target.value.toLowerCase().replace(/\s+/g, "-")}`);
                  }
                }}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">URL Slug</label>
              <input
                type="text"
                required
                placeholder="/about"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">SEO Title (Optional)</label>
              <input
                type="text"
                placeholder="Page Title"
                value={newSeoTitle}
                onChange={(e) => setNewSeoTitle(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400">SEO Description (Optional)</label>
              <textarea
                rows={3}
                placeholder="Brief description for search engines"
                value={newSeoDesc}
                onChange={(e) => setNewSeoDesc(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Create Page
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
