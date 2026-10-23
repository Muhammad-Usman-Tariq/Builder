"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "@builder/auth/client";
import { trpc } from "../../lib/trpc";

export default function SettingsPage() {
  const { data: sessionData, isPending: sessionPending } = useSession();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [figmaToken, setFigmaToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: workspaces } = trpc.workspaces.list.useQuery(undefined, {
    enabled: !!sessionData?.user,
  });

  React.useEffect(() => {
    if (workspaces && workspaces.length > 0 && !activeWorkspaceId) {
      setActiveWorkspaceId(workspaces[0]!.id);
    }
  }, [workspaces, activeWorkspaceId]);

  const { data: figmaStatus } = trpc.integrations.getFigma.useQuery(
    { workspaceId: activeWorkspaceId || "" },
    { enabled: !!activeWorkspaceId }
  );

  const { data: vercelStatus } = trpc.publish.getIntegration.useQuery(
    { workspaceId: activeWorkspaceId || "" },
    { enabled: !!activeWorkspaceId }
  );

  const connectFigmaMutation = trpc.integrations.connectFigma.useMutation({
    onSuccess: () => {
      setFigmaToken("");
      setFeedbackMsg({ type: "success", text: "Figma token connected securely!" });
      if (activeWorkspaceId) void utils.integrations.getFigma.invalidate({ workspaceId: activeWorkspaceId });
    },
    onError: (err) => {
      setFeedbackMsg({ type: "error", text: err.message || "Failed to save Figma token" });
    },
  });

  const disconnectFigmaMutation = trpc.integrations.disconnectFigma.useMutation({
    onSuccess: () => {
      setFeedbackMsg({ type: "success", text: "Figma disconnected" });
      if (activeWorkspaceId) void utils.integrations.getFigma.invalidate({ workspaceId: activeWorkspaceId });
    },
  });

  const connectVercelMutation = trpc.publish.connect.useMutation({
    onSuccess: () => {
      setVercelToken("");
      setFeedbackMsg({ type: "success", text: "Vercel integration connected!" });
      if (activeWorkspaceId) void utils.publish.getIntegration.invalidate({ workspaceId: activeWorkspaceId });
    },
    onError: (err) => {
      setFeedbackMsg({ type: "error", text: err.message || "Failed to save Vercel token" });
    },
  });

  const disconnectVercelMutation = trpc.publish.disconnect.useMutation({
    onSuccess: () => {
      setFeedbackMsg({ type: "success", text: "Vercel disconnected" });
      if (activeWorkspaceId) void utils.publish.getIntegration.invalidate({ workspaceId: activeWorkspaceId });
    },
  });

  if (sessionPending) {
    return <div className="p-8 text-neutral-500">Loading settings...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-8">
      <div className="mx-auto max-w-4xl flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <Link href="/dashboard" className="text-xs text-blue-400 hover:underline">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold mt-1 text-white">Workspace Integrations & Settings</h1>
          </div>
        </div>

        {feedbackMsg && (
          <div
            className={`rounded-lg p-3 text-xs ${
              feedbackMsg.type === "success"
                ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                : "bg-red-950/40 border border-red-500/30 text-red-300"
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Figma Integration Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">❖</span>
              <div>
                <h2 className="text-base font-semibold text-white">Figma Integration</h2>
                <p className="text-xs text-neutral-400">
                  Import Auto Layout frames, components, and design systems directly into sites.
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                figmaStatus?.connected
                  ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {figmaStatus?.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {figmaStatus?.connected ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-neutral-400">
                Personal Access Token is securely stored and encrypted with AES-256-GCM.
              </span>
              <button
                onClick={() => {
                  if (activeWorkspaceId) disconnectFigmaMutation.mutate({ workspaceId: activeWorkspaceId });
                }}
                disabled={disconnectFigmaMutation.isPending}
                className="rounded border border-red-800/60 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <label className="text-xs text-neutral-400">Personal Access Token (PAT)</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="figd_..."
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (activeWorkspaceId && figmaToken.trim()) {
                      connectFigmaMutation.mutate({ workspaceId: activeWorkspaceId, token: figmaToken.trim() });
                    }
                  }}
                  disabled={!figmaToken.trim() || connectFigmaMutation.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Save Token
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Vercel Integration Card */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">▲</span>
              <div>
                <h2 className="text-base font-semibold text-white">Vercel Publishing & Custom Domains</h2>
                <p className="text-xs text-neutral-400">
                  Deploy edge distributions and bind custom customer domains.
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                vercelStatus?.connected
                  ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                  : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {vercelStatus?.connected ? "Connected" : "Not connected"}
            </span>
          </div>

          {vercelStatus?.connected ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-neutral-400">
                Connected account: Active Vercel Integration (AES-256-GCM encrypted)
              </span>
              <button
                onClick={() => {
                  if (activeWorkspaceId) disconnectVercelMutation.mutate({ workspaceId: activeWorkspaceId });
                }}
                disabled={disconnectVercelMutation.isPending}
                className="rounded border border-red-800/60 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 pt-2">
              <label className="text-xs text-neutral-400">Vercel API Access Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Vercel Access Token"
                  value={vercelToken}
                  onChange={(e) => setVercelToken(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (activeWorkspaceId && vercelToken.trim()) {
                      connectVercelMutation.mutate({ workspaceId: activeWorkspaceId, token: vercelToken.trim() });
                    }
                  }}
                  disabled={!vercelToken.trim() || connectVercelMutation.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Save Token
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
