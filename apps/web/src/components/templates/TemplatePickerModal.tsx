"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../../lib/trpc";

interface TemplatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

const CATEGORIES = ["All", "SaaS", "Agency", "Restaurant", "E-Commerce", "Creator"] as const;

export function TemplatePickerModal({
  isOpen,
  onClose,
  workspaceId,
}: TemplatePickerModalProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [siteName, setSiteName] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);

  // Fetch certified templates
  const { data: templates, isLoading } = trpc.templates.list.useQuery(
    selectedCategory === "All" ? undefined : { category: selectedCategory },
    { enabled: isOpen }
  );

  const createFromTemplate = trpc.templates.createSiteFromTemplate.useMutation({
    onSuccess: (data) => {
      setIsConfirmOpen(false);
      onClose();
      if (data?.siteId) {
        router.push(`/editor/${data.siteId}`);
      }
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              Start from a Certified Template
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Choose from 5 handcrafted, production-grade templates with responsive layouts and full design systems.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>

        {/* Category Pills */}
        <div className="sticky top-0 z-10 shrink-0 flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-6 py-3.5 min-h-[56px] backdrop-blur-sm">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs font-medium leading-none transition-all ${
                selectedCategory === cat
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Template Catalog Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-neutral-400">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
                <span>Loading templates...</span>
              </div>
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="group flex flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:border-neutral-300 hover:shadow-lg"
                >
                  <div>
                    {/* Thumbnail */}
                    <div className="relative h-44 w-full overflow-hidden bg-neutral-100">
                      {tmpl.preview ? (
                        <img
                          src={tmpl.preview}
                          alt={`${tmpl.name} preview`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                          Template Preview
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span className="rounded-md bg-neutral-900/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                          {tmpl.pageCount} {tmpl.pageCount === 1 ? "page" : "pages"}
                        </span>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                          {tmpl.category}
                        </span>
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {tmpl.style}
                        </span>
                      </div>
                      <h3 className="mt-1 text-base font-bold text-neutral-900">
                        {tmpl.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-500 leading-relaxed">
                        {tmpl.description}
                      </p>

                      {/* Tags */}
                      <div className="mt-3 flex flex-wrap gap-1">
                        {tmpl.tags?.slice(0, 3).map((tag: string) => (
                          <span
                            key={tag}
                            className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50/50 p-3">
                    <button
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="flex-1 rounded-lg border border-neutral-200 bg-white py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTemplate(tmpl);
                        setSiteName(`My ${tmpl.name}`);
                        setIsConfirmOpen(true);
                      }}
                      className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
                    >
                      Use Template
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-neutral-500">
              No templates found in this category.
            </div>
          )}
        </div>
      </div>

      {/* Template Details & Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">{previewTemplate.name}</h3>
                <span className="text-xs font-medium text-blue-600">{previewTemplate.category}</span>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <img
                src={previewTemplate.preview}
                alt={previewTemplate.name}
                className="w-full rounded-xl object-cover shadow-sm"
              />
              <p className="mt-4 text-sm text-neutral-600 leading-relaxed">
                {previewTemplate.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {previewTemplate.tags?.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-neutral-200 bg-neutral-50 px-6 py-3">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  setSelectedTemplate(previewTemplate);
                  setSiteName(`My ${previewTemplate.name}`);
                  setPreviewTemplate(null);
                  setIsConfirmOpen(true);
                }}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800"
              >
                Use this Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Site Name Dialog */}
      {isConfirmOpen && selectedTemplate && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">
              Create Site from Template
            </h3>
            <p className="mt-1 text-xs text-neutral-500">
              You are instantiating <span className="font-semibold text-neutral-700">{selectedTemplate.name}</span>. A full editable copy with fresh element IDs and {selectedTemplate.pageCount} pages will be created in your workspace.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-medium text-neutral-700">Website Name</label>
              <input
                type="text"
                required
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="My Website"
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!siteName.trim() || createFromTemplate.isPending}
                onClick={() => {
                  if (workspaceId && selectedTemplate && siteName.trim()) {
                    createFromTemplate.mutate({
                      workspaceId,
                      templateSlugOrId: selectedTemplate.slug,
                      name: siteName.trim(),
                    });
                  }
                }}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {createFromTemplate.isPending ? "Creating Site..." : "Create & Launch Editor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
