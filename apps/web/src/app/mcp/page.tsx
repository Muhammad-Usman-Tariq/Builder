"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "@builder/auth/client";
import { trpc } from "../../lib/trpc";

type TabId = "connect" | "tokens" | "external" | "activity";

export default function McpPage() {
  const { data: sessionData, isPending: sessionPending } = useSession();
  const utils = trpc.useUtils();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("connect");
  const [origin, setOrigin] = useState<string>("");

  // Token creation state
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenPermission, setTokenPermission] = useState<"read-write" | "read-only">("read-write");
  const [createdTokenResult, setCreatedTokenResult] = useState<{
    token: string;
    name: string;
    permission: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // External server state
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [serverToken, setServerToken] = useState("");
  const [testResult, setTestResult] = useState<{
    serverId?: string | undefined;
    success: boolean;
    message: string;
  } | null>(null);

  // Revoke confirmation modal state
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const { data: workspaces, isLoading: wsLoading } = trpc.workspaces.list.useQuery(undefined, {
    enabled: !!sessionData?.user,
  });

  useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[0]!.id);
    }
  }, [workspaces, activeWorkspaceId]);

  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const isAdminOrOwner =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";

  // Data queries
  const { data: apiKeys = [], isLoading: keysLoading } = trpc.mcp.listApiKeys.useQuery(
    { workspaceId: activeWorkspaceId || "" },
    { enabled: !!activeWorkspaceId }
  );

  const { data: externalServers = [], isLoading: serversLoading } =
    trpc.mcp.listExternalServers.useQuery(
      { workspaceId: activeWorkspaceId || "" },
      { enabled: !!activeWorkspaceId }
    );

  const { data: activities = [], isLoading: activitiesLoading, refetch: refetchActivity } =
    trpc.mcp.listActivity.useQuery(
      { workspaceId: activeWorkspaceId || "", limit: 50, offset: 0 },
      { enabled: !!activeWorkspaceId }
    );

  const { data: sitesList = [], isLoading: sitesLoading } = trpc.sites.list.useQuery(
    { workspaceId: activeWorkspaceId || "" },
    { enabled: !!activeWorkspaceId }
  );

  const [copiedSiteId, setCopiedSiteId] = useState<string | null>(null);

  // Mutations
  const approveMutation = trpc.mcp.approveAction.useMutation({
    onSuccess: () => {
      if (activeWorkspaceId) {
        void utils.mcp.listActivity.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const rejectMutation = trpc.mcp.rejectAction.useMutation({
    onSuccess: () => {
      if (activeWorkspaceId) {
        void utils.mcp.listActivity.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const createTokenMutation = trpc.mcp.createApiKey.useMutation({
    onSuccess: (data) => {
      setCreatedTokenResult({
        token: data.token,
        name: data.name,
        permission: data.permission,
      });
      setIsCreatingToken(false);
      setTokenName("");
      if (activeWorkspaceId) {
        void utils.mcp.listApiKeys.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const revokeTokenMutation = trpc.mcp.revokeApiKey.useMutation({
    onSuccess: () => {
      setRevokingKeyId(null);
      if (activeWorkspaceId) {
        void utils.mcp.listApiKeys.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const addServerMutation = trpc.mcp.addExternalServer.useMutation({
    onSuccess: () => {
      setIsAddingServer(false);
      setServerName("");
      setServerUrl("");
      setServerToken("");
      if (activeWorkspaceId) {
        void utils.mcp.listExternalServers.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const removeServerMutation = trpc.mcp.removeExternalServer.useMutation({
    onSuccess: () => {
      if (activeWorkspaceId) {
        void utils.mcp.listExternalServers.invalidate({ workspaceId: activeWorkspaceId });
      }
    },
  });

  const testServerMutation = trpc.mcp.testExternalServer.useMutation({
    onSuccess: (res, vars) => {
      setTestResult({
        serverId: vars.serverId,
        success: res.success,
        message: res.message,
      });
    },
    onError: (err, vars) => {
      setTestResult({
        serverId: vars.serverId,
        success: false,
        message: err.message || "Failed to test server",
      });
    },
  });

  const endpointUrl = origin ? `${origin}/mcp` : "http://localhost:3000/mcp";
  const isLocalhost =
    endpointUrl.includes("localhost") || endpointUrl.includes("127.0.0.1");

  const copyToClipboard = (text: string, type: "endpoint" | "token" | "snippet", snippetKey?: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    if (type === "endpoint") {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    } else if (type === "token") {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else if (type === "snippet" && snippetKey) {
      setCopiedSnippet(snippetKey);
      setTimeout(() => setCopiedSnippet(null), 2000);
    }
  };

  const claudeConfigSnippet = `{
  "mcpServers": {
    "builder": {
      "url": "${endpointUrl}",
      "headers": {
        "Authorization": "Bearer <your token>"
      }
    }
  }
}`;

  const inspectorCommandSnippet = `npx @modelcontextprotocol/inspector --transport sse --url ${endpointUrl} --header "Authorization: Bearer <your token>"`;

  if (sessionPending || wsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
          <span>Loading MCP settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="border-b border-neutral-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold tracking-tight text-neutral-900">
              Builder
            </Link>
            <span className="text-neutral-300">/</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-800">MCP & API</span>
              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                Model Context Protocol
              </span>
            </div>
            <span className="text-neutral-300">/</span>
            {/* Workspace selector */}
            <select
              value={activeWorkspaceId || ""}
              onChange={(e) => setActiveWorkspaceId(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-neutral-100 py-1 pl-2.5 pr-7 text-xs font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              {workspaces?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.role})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Intro */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Model Context Protocol (MCP) & API
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Connect AI assistants (Claude Desktop, Cursor, Cline, MCP Inspector) directly to your websites.
          </p>
        </div>

        {/* Read-Only Warning for non-admins */}
        {!isAdminOrOwner && (
          <div
            data-testid="mcp-readonly-warning"
            className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            <div className="flex items-start gap-3">
              <span className="text-lg">ℹ️</span>
              <div>
                <strong className="font-semibold">Read-only workspace access:</strong>
                <p className="mt-0.5">
                  You are viewing this workspace as a {activeWorkspace?.role || "Member"}. Creating API tokens
                  or connecting external servers requires an Admin or Owner. You may inspect existing
                  connections and recent activity.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex border-b border-neutral-200 space-x-8">
          <button
            onClick={() => setActiveTab("connect")}
            data-testid="tab-connect"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "connect"
                ? "border-neutral-900 text-neutral-900 font-semibold"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            🔌 Connect
          </button>
          <button
            onClick={() => setActiveTab("tokens")}
            data-testid="tab-tokens"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "tokens"
                ? "border-neutral-900 text-neutral-900 font-semibold"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            🔑 Tokens ({apiKeys.length})
          </button>
          <button
            onClick={() => setActiveTab("external")}
            data-testid="tab-external"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "external"
                ? "border-neutral-900 text-neutral-900 font-semibold"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            🌐 External servers ({externalServers.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("activity");
              refetchActivity();
            }}
            data-testid="tab-activity"
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === "activity"
                ? "border-neutral-900 text-neutral-900 font-semibold"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            📊 Activity
          </button>
        </div>

        {/* TAB 1: CONNECT */}
        {activeTab === "connect" && (
          <div className="space-y-6">
            {/* Warning if localhost */}
            {isLocalhost && (
              <div
                data-testid="localhost-warning"
                className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3"
              >
                <span className="text-xl">⚠️</span>
                <div>
                  <strong className="font-semibold text-amber-950">Localhost Endpoint Notice:</strong>
                  <p className="mt-1">
                    External AI clients cannot reach localhost. Use a public URL (e.g. a Cloudflare Tunnel)
                    for remote clients.
                  </p>
                </div>
              </div>
            )}

            {/* Endpoint Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-neutral-900">Your MCP Endpoint</h2>
              <p className="mt-1 text-xs text-neutral-500">
                Use this streamable HTTP / SSE endpoint in your AI assistant or client configuration.
              </p>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3.5 py-2.5 font-mono text-xs text-neutral-800 select-all">
                  {endpointUrl}
                </div>
                <button
                  type="button"
                  data-testid="copy-endpoint-btn"
                  onClick={() => copyToClipboard(endpointUrl, "endpoint")}
                  className="rounded-lg bg-neutral-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  {copiedEndpoint ? "Copied!" : "Copy URL"}
                </button>
              </div>
            </div>

            {/* Workspace Sites & IDs */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Workspace Sites & IDs</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Use these Site IDs in tools like <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">get_site_structure</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">list_pages</code>, and <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">create_section</code>.
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                  {sitesList.length} Site{sitesList.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 divide-y divide-neutral-100">
                {sitesLoading ? (
                  <div className="py-4 text-center text-xs text-neutral-400">Loading sites...</div>
                ) : sitesList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-neutral-400">No sites in this workspace yet.</div>
                ) : (
                  sitesList.map((site) => (
                    <div key={site.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">{site.name}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700" data-testid={`site-id-display-${site.id}`}>
                            {site.id}
                          </code>
                          <span className="text-[11px] text-neutral-400">
                            Updated {new Date(site.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/editor/${site.id}`}
                          className="rounded border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                        >
                          Open Editor
                        </Link>
                        <button
                          type="button"
                          data-testid={`copy-site-id-${site.id}`}
                          onClick={() => {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(site.id);
                              setCopiedSiteId(site.id);
                              setTimeout(() => setCopiedSiteId(null), 2000);
                            }
                          }}
                          className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 shadow-sm transition-colors"
                        >
                          {copiedSiteId === site.id ? "Copied!" : "Copy ID"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Claude Desktop */}
              <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <h3 className="text-sm font-semibold text-neutral-900">Claude Desktop</h3>
                  </div>
                  <p className="mt-2 text-xs text-neutral-600">
                    Add the server to your <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">claude_desktop_config.json</code> file:
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-[11px] font-mono text-neutral-200">
                    {claudeConfigSnippet}
                  </pre>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-between items-center">
                  <span className="text-xs text-neutral-400">Requires Bearer token</span>
                  <button
                    onClick={() => copyToClipboard(claudeConfigSnippet, "snippet", "claude")}
                    className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    {copiedSnippet === "claude" ? "Copied!" : "Copy config"}
                  </button>
                </div>
              </div>

              {/* MCP Inspector */}
              <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔍</span>
                    <h3 className="text-sm font-semibold text-neutral-900">MCP Inspector</h3>
                  </div>
                  <p className="mt-2 text-xs text-neutral-600">
                    Test tools and inspect schemas directly from your terminal:
                  </p>
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-[11px] font-mono text-neutral-200">
                    {inspectorCommandSnippet}
                  </pre>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-between items-center">
                  <span className="text-xs text-neutral-400">Official SDK inspector</span>
                  <button
                    onClick={() => copyToClipboard(inspectorCommandSnippet, "snippet", "inspector")}
                    className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    {copiedSnippet === "inspector" ? "Copied!" : "Copy command"}
                  </button>
                </div>
              </div>
            </div>

            {/* Available Tools Reference */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">Supported Built-in Tools</h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-900">list_sites</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Read</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Lists workspace sites with ID, name, last updated, and pages count.
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-900">get_site_structure</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Read</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Inspects page hierarchy, tokens and element counts.
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-900">list_pages</span>
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Read</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Lists all pages and routes defined in the site.
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-900">update_text</span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Write</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Updates text content of any element in real-time.
                  </p>
                </div>
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-neutral-900">create_section</span>
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Write</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Generates pre-designed section with confirmation flow.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TOKENS */}
        {activeTab === "tokens" && (
          <div className="space-y-6">
            {/* Newly Created Token Display (Shown ONCE) */}
            {createdTokenResult && (
              <div
                data-testid="created-token-box"
                className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-6 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-emerald-950">
                      Token Created: {createdTokenResult.name}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-emerald-800">
                      Copy it now — you will not be able to see it again.
                    </p>
                  </div>
                  <span className="rounded bg-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                    {createdTokenResult.permission}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={createdTokenResult.token}
                    data-testid="created-token-value"
                    className="flex-1 rounded-lg border border-emerald-300 bg-white px-3.5 py-2 font-mono text-xs font-semibold text-neutral-900 select-all"
                  />
                  <button
                    type="button"
                    data-testid="copy-token-btn"
                    onClick={() => copyToClipboard(createdTokenResult.token, "token")}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 transition-colors"
                  >
                    {copiedToken ? "Copied!" : "Copy Token"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatedTokenResult(null)}
                    className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Token List Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">API Access Tokens</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Authenticate your AI clients. Only SHA-256 hashes are stored in the database.
                </p>
              </div>
              {isAdminOrOwner && (
                <button
                  type="button"
                  data-testid="create-token-btn"
                  onClick={() => setIsCreatingToken(true)}
                  className="rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  + Create Token
                </button>
              )}
            </div>

            {/* Create Token Modal / Card */}
            {isCreatingToken && (
              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-900">Create New Token</h3>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700">Token Name</label>
                    <input
                      type="text"
                      data-testid="token-name-input"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="e.g. Claude Desktop or Cursor"
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700">Permission Level</label>
                    <select
                      data-testid="token-permission-select"
                      value={tokenPermission}
                      onChange={(e) =>
                        setTokenPermission(e.target.value as "read-write" | "read-only")
                      }
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="read-write">read-write (read structure & write changes)</option>
                      <option value="read-only">read-only (inspect site structure only)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsCreatingToken(false)}
                    className="rounded-lg border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="submit-create-token-btn"
                    disabled={!tokenName.trim() || createTokenMutation.isPending}
                    onClick={() => {
                      if (!activeWorkspaceId) return;
                      createTokenMutation.mutate({
                        workspaceId: activeWorkspaceId,
                        name: tokenName.trim(),
                        permission: tokenPermission,
                      });
                    }}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {createTokenMutation.isPending ? "Generating..." : "Generate Token"}
                  </button>
                </div>
              </div>
            )}

            {/* Tokens Table */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
              <table data-testid="tokens-table" className="min-w-full divide-y divide-neutral-200 text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Name</th>
                    <th className="px-6 py-3 font-semibold">Permission</th>
                    <th className="px-6 py-3 font-semibold">Token</th>
                    <th className="px-6 py-3 font-semibold">Created</th>
                    <th className="px-6 py-3 font-semibold">Last Used</th>
                    {isAdminOrOwner && <th className="px-6 py-3 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white text-neutral-800">
                  {keysLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-neutral-400">
                        Loading tokens...
                      </td>
                    </tr>
                  ) : apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-neutral-400">
                        No tokens created yet. Create one to connect AI assistants.
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((key) => (
                      <tr key={key.id} data-testid={`token-row-${key.id}`} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 font-medium text-neutral-900">{key.name}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${
                              key.permission === "read-only"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {key.permission}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-neutral-600">
                          {key.prefix}
                        </td>
                        <td className="px-6 py-4 text-neutral-500">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-neutral-500">
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleString()
                            : "Never"}
                        </td>
                        {isAdminOrOwner && (
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              data-testid="revoke-token-btn"
                              onClick={() => setRevokingKeyId(key.id)}
                              className="rounded px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Revoke
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Revoke Confirmation Modal */}
            {revokingKeyId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
                  <h4 className="text-base font-bold text-neutral-900">Revoke Token?</h4>
                  <p className="mt-2 text-xs text-neutral-600">
                    Any AI agent or script using this token will immediately lose access and be rejected.
                  </p>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setRevokingKeyId(null)}
                      className="rounded-lg border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="confirm-revoke-btn"
                      onClick={() => {
                        if (!activeWorkspaceId) return;
                        revokeTokenMutation.mutate({
                          workspaceId: activeWorkspaceId,
                          keyId: revokingKeyId,
                        });
                      }}
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
                    >
                      {revokeTokenMutation.isPending ? "Revoking..." : "Yes, Revoke"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: EXTERNAL SERVERS */}
        {activeTab === "external" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Connected MCP Servers</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Connect third-party MCP servers so the AI copilot can discover and call their tools.
                </p>
              </div>
              {isAdminOrOwner && (
                <button
                  type="button"
                  data-testid="add-external-server-btn"
                  onClick={() => setIsAddingServer(true)}
                  className="rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                  + Add External Server
                </button>
              )}
            </div>

            {/* Add Server Form */}
            {isAddingServer && (
              <div className="rounded-xl border border-neutral-300 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-neutral-900">Add External Server</h3>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700">Server Name</label>
                    <input
                      type="text"
                      data-testid="server-name-input"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="e.g. Stripe or GitHub MCP"
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700">Server URL</label>
                    <input
                      type="url"
                      data-testid="server-url-input"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://mcp.example.com"
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700">Auth Token (Optional)</label>
                    <input
                      type="password"
                      data-testid="server-token-input"
                      value={serverToken}
                      onChange={(e) => setServerToken(e.target.value)}
                      placeholder="Optional Bearer token"
                      className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsAddingServer(false)}
                    className="rounded-lg border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="submit-server-btn"
                    disabled={!serverName.trim() || !serverUrl.trim() || addServerMutation.isPending}
                    onClick={() => {
                      if (!activeWorkspaceId) return;
                      addServerMutation.mutate({
                        workspaceId: activeWorkspaceId,
                        name: serverName.trim(),
                        url: serverUrl.trim(),
                        token: serverToken.trim() || undefined,
                      });
                    }}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {addServerMutation.isPending ? "Connecting..." : "Add Server"}
                  </button>
                </div>
              </div>
            )}

            {/* Test connection alert message */}
            {testResult && (
              <div
                className={`rounded-lg p-3 text-xs flex items-center justify-between ${
                  testResult.success
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                <span>{testResult.message}</span>
                <button
                  type="button"
                  onClick={() => setTestResult(null)}
                  className="font-bold ml-2 text-neutral-500 hover:text-neutral-800"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Servers List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serversLoading ? (
                <div className="col-span-2 text-center py-8 text-neutral-400 text-xs">
                  Loading external servers...
                </div>
              ) : externalServers.length === 0 ? (
                <div className="col-span-2 rounded-xl border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-400">
                  No external MCP servers configured yet.
                </div>
              ) : (
                externalServers.map((srv) => (
                  <div
                    key={srv.id}
                    data-testid={`server-card-${srv.id}`}
                    className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🌐</span>
                          <h4 className="text-sm font-bold text-neutral-900">{srv.name}</h4>
                        </div>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Active
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-xs text-neutral-600 break-all">{srv.url}</p>

                      <div className="mt-3">
                        <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                          Tools Discovered ({srv.tools.length})
                        </span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {srv.tools.map((t, i) => (
                            <span
                              key={i}
                              className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-700"
                              title={t.description}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {isAdminOrOwner && (
                      <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          data-testid="test-server-btn"
                          disabled={testServerMutation.isPending}
                          onClick={() => {
                            if (!activeWorkspaceId) return;
                            testServerMutation.mutate({
                              workspaceId: activeWorkspaceId,
                              serverId: srv.id,
                              url: srv.url,
                            });
                          }}
                          className="rounded border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                        >
                          {testServerMutation.isPending ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                          type="button"
                          data-testid="remove-server-btn"
                          disabled={removeServerMutation.isPending}
                          onClick={() => {
                            if (!activeWorkspaceId) return;
                            removeServerMutation.mutate({
                              workspaceId: activeWorkspaceId,
                              serverId: srv.id,
                            });
                          }}
                          className="rounded px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ACTIVITY */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Recent MCP Activity</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Immutable audit records from the <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-800">audit_log</code> table.
                </p>
              </div>
              <button
                type="button"
                onClick={() => refetchActivity()}
                className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 shadow-sm"
              >
                ↻ Refresh
              </button>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
              <table data-testid="activity-table" className="min-w-full divide-y divide-neutral-200 text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Time</th>
                    <th className="px-6 py-3 font-semibold">Token / Actor</th>
                    <th className="px-6 py-3 font-semibold">Tool</th>
                    <th className="px-6 py-3 font-semibold">Target / Site</th>
                    <th className="px-6 py-3 font-semibold">Result</th>
                    <th className="px-6 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white text-neutral-800">
                  {activitiesLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-neutral-400">
                        Loading activity logs...
                      </td>
                    </tr>
                  ) : activities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-neutral-400">
                        No MCP calls recorded yet.
                      </td>
                    </tr>
                  ) : (
                    activities.map((act) => {
                      let badgeColor = "bg-emerald-100 text-emerald-800";
                      if (act.result === "denied") {
                        badgeColor = "bg-red-100 text-red-800";
                      } else if (act.result === "waiting for confirmation") {
                        badgeColor = "bg-amber-100 text-amber-800";
                      } else if (act.result === "error") {
                        badgeColor = "bg-neutral-200 text-neutral-800";
                      }

                      return (
                        <tr key={act.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-3.5 text-neutral-500 whitespace-nowrap">
                            {new Date(act.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-3.5 font-medium text-neutral-900">
                            {act.tokenName}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-neutral-700">
                            {act.tool}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-neutral-500 text-[11px] truncate max-w-[150px]">
                            {act.site}
                          </td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}
                            >
                              {act.result}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right whitespace-nowrap">
                            {act.isPending ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  data-testid={`approve-btn-${act.id}`}
                                  disabled={approveMutation.isPending || !isAdminOrOwner}
                                  onClick={() => {
                                    if (!activeWorkspaceId) return;
                                    approveMutation.mutate({
                                      workspaceId: activeWorkspaceId,
                                      logId: act.id,
                                    });
                                  }}
                                  className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-sm"
                                >
                                  {approveMutation.isPending ? "..." : "Approve"}
                                </button>
                                <button
                                  type="button"
                                  data-testid={`reject-btn-${act.id}`}
                                  disabled={rejectMutation.isPending || !isAdminOrOwner}
                                  onClick={() => {
                                    if (!activeWorkspaceId) return;
                                    rejectMutation.mutate({
                                      workspaceId: activeWorkspaceId,
                                      logId: act.id,
                                    });
                                  }}
                                  className="rounded border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                                >
                                  {rejectMutation.isPending ? "..." : "Reject"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-neutral-400 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
