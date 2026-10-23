"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@builder/auth/client";
import { trpc } from "../../lib/trpc";
import { AiCreateSiteModal } from "../../components/ai/AiCreateSiteModal";
import { TemplatePickerModal } from "../../components/templates/TemplatePickerModal";
import { UrlImportModal } from "../../components/dashboard/UrlImportModal";
import { FigmaImportModal } from "../../components/dashboard/FigmaImportModal";
import { ScreenshotImportModal } from "../../components/dashboard/ScreenshotImportModal";

export default function DashboardPage() {
  const router = useRouter();
  const { data: sessionData, isPending: sessionPending } = useSession();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAiCreateOpen, setIsAiCreateOpen] = useState(false);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isImportUrlOpen, setIsImportUrlOpen] = useState(false);
  const [isFigmaImportOpen, setIsFigmaImportOpen] = useState(false);
  const [isImportScreenshotOpen, setIsImportScreenshotOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Workspaces list
  const { data: workspaces, isLoading: wsLoading } = trpc.workspaces.list.useQuery(
    undefined,
    {
      enabled: !!sessionData?.user,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );

  // Set default active workspace
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[0]!.id);
    }
  }, [workspaces, activeWorkspaceId]);

  // Sites list for active workspace
  const {
    data: sites,
    isLoading: sitesLoading,
    refetch: refetchSites,
  } = trpc.sites.list.useQuery(
    { workspaceId: activeWorkspaceId || "", includeTrash: false },
    {
      enabled: !!activeWorkspaceId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    }
  );

  // Mutations
  const createSite = trpc.sites.create.useMutation({
    onSuccess: (newSite) => {
      setIsCreateOpen(false);
      setNewSiteName("");
      refetchSites();
      if (newSite?.id) {
        router.push(`/editor/${newSite.id}`);
      }
    },
  });

  const duplicateSite = trpc.sites.duplicate.useMutation({
    onSuccess: () => {
      refetchSites();
    },
  });

  const renameSite = trpc.sites.rename.useMutation({
    onSuccess: () => {
      setEditingSiteId(null);
      setEditName("");
      refetchSites();
    },
  });

  const trashSite = trpc.sites.trash.useMutation({
    onSuccess: () => {
      refetchSites();
    },
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!sessionPending && !sessionData?.user) {
      router.push("/login");
    }
  }, [sessionPending, sessionData, router]);

  if (sessionPending || wsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
          <span>Loading workspace...</span>
        </div>
      </div>
    );
  }

  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top Navbar */}
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold tracking-tight">
              Builder
            </Link>
            <span className="text-neutral-300">/</span>
            {/* Workspace Selector */}
            <div className="relative">
              <select
                value={activeWorkspaceId || ""}
                onChange={(e) => setActiveWorkspaceId(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-neutral-100 py-1.5 pl-3 pr-8 text-sm font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              >
                {workspaces?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-neutral-600">
              {sessionData?.user?.name || sessionData?.user?.email}
            </span>
            {(activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN") && (
              <Link
                href="/mcp"
                data-testid="mcp-nav-link"
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
              >
                MCP & API
              </Link>
            )}
            <Link
              href="/settings"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Settings
            </Link>
            <button
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Websites</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage and build websites in {activeWorkspace?.name || "your workspace"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTemplatePickerOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all"
            >
              <span>📋</span>
              <span>Start from template</span>
            </button>
            <button
              onClick={() => setIsImportUrlOpen(true)}
              data-testid="import-url-btn"
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all"
            >
              <span>🌐</span>
              <span>Import from website</span>
            </button>
            <button
              onClick={() => setIsFigmaImportOpen(true)}
              data-testid="import-figma-btn"
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all"
            >
              <span>❖</span>
              <span>Import from Figma</span>
            </button>
            <button
              onClick={() => setIsImportScreenshotOpen(true)}
              data-testid="import-screenshot-btn"
              className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all"
            >
              <span>📷</span>
              <span>Import from screenshot</span>
            </button>
            <button
              onClick={() => setIsAiCreateOpen(true)}
              data-testid="create-ai-btn"
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:from-blue-500 hover:to-indigo-500 transition-all"
            >
              <span>✦</span>
              <span>Create with AI</span>
            </button>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <span>+</span>
              <span>Blank site</span>
            </button>
          </div>
        </div>

        {/* Sites Grid */}
        {sitesLoading ? (
          <div className="py-12 text-center text-sm text-neutral-500">Loading sites...</div>
        ) : sites && sites.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <div
                key={site.id}
                className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      {editingSiteId === site.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded border border-neutral-300 px-2 py-1 text-sm font-semibold"
                            autoFocus
                          />
                          <button
                            onClick={() =>
                              renameSite.mutate({ siteId: site.id, name: editName })
                            }
                            disabled={!editName.trim()}
                            className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingSiteId(null)}
                            className="text-xs text-neutral-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <h3 className="font-semibold text-neutral-900">{site.name}</h3>
                      )}
                      <p className="mt-1 text-xs text-neutral-400">
                        Updated {new Date(site.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="my-6 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-neutral-100 bg-neutral-50 text-xs text-neutral-400">
                    {site.previewImage ? (
                      <img
                        src={site.previewImage}
                        alt={site.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-slate-900 to-indigo-950 p-3 text-center text-white">
                        <span className="line-clamp-2 text-xs font-medium text-slate-200">
                          {site.previewHeading || site.name}
                        </span>
                        <span className="mt-1 text-[10px] text-indigo-300">Preview</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
                  <Link
                    href={`/editor/${site.id}`}
                    className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                  >
                    Open Editor →
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingSiteId(site.id);
                        setEditName(site.name);
                      }}
                      className="text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      Rename
                    </button>
                    <span className="text-neutral-300">•</span>
                    <button
                      onClick={() => duplicateSite.mutate({ siteId: site.id })}
                      className="text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      Duplicate
                    </button>
                    <span className="text-neutral-300">•</span>
                    <button
                      onClick={() => {
                        if (confirm(`Move "${site.name}" to trash?`)) {
                          trashSite.mutate({ siteId: site.id });
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-neutral-200 py-16 text-center">
            <h3 className="text-base font-semibold text-neutral-800">No websites created yet</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Get started by creating your first blank website or starting from a template.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setIsTemplatePickerOpen(true)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Browse templates
              </button>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Create blank site
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Create Site Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-neutral-900">Create a new website</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Enter a name for your project to begin building.
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-neutral-700">Website Name</label>
              <input
                type="text"
                required
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="My Awesome Website"
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setNewSiteName("");
                }}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newSiteName.trim() || createSite.isPending}
                onClick={() => {
                  if (activeWorkspaceId && newSiteName.trim()) {
                    createSite.mutate({
                      workspaceId: activeWorkspaceId,
                      name: newSiteName.trim(),
                    });
                  }
                }}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {createSite.isPending ? "Creating..." : "Create Website"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Create Site Modal */}
      <AiCreateSiteModal
        isOpen={isAiCreateOpen}
        onClose={() => {
          setIsAiCreateOpen(false);
          refetchSites();
        }}
        workspaceId={activeWorkspaceId || ""}
      />

      {/* Template Picker Modal */}
      <TemplatePickerModal
        isOpen={isTemplatePickerOpen}
        onClose={() => {
          setIsTemplatePickerOpen(false);
          refetchSites();
        }}
        workspaceId={activeWorkspaceId || ""}
      />

      {/* URL Import Modal */}
      <UrlImportModal
        isOpen={isImportUrlOpen}
        onClose={() => {
          setIsImportUrlOpen(false);
          refetchSites();
        }}
        workspaceId={activeWorkspaceId || ""}
      />

      {/* Figma Import Modal */}
      <FigmaImportModal
        isOpen={isFigmaImportOpen}
        onClose={() => {
          setIsFigmaImportOpen(false);
          refetchSites();
        }}
        workspaceId={activeWorkspaceId || ""}
      />

      {/* Screenshot Import Modal */}
      <ScreenshotImportModal
        isOpen={isImportScreenshotOpen}
        onClose={() => {
          setIsImportScreenshotOpen(false);
          refetchSites();
        }}
        workspaceId={activeWorkspaceId || ""}
      />
    </div>
  );
}
