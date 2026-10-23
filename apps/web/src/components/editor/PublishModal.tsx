"use client";

import React, { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function sanitizeVercelError(msg?: string): string {
  if (!msg) return "";
  const lower = msg.toLowerCase();
  if (
    lower.includes("not authorized") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("scope") ||
    lower.includes("expired") ||
    lower.includes("revoked")
  ) {
    return "Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations.";
  }
  return msg;
}

interface PublishModalProps {
  siteId: string;
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PublishModal({
  siteId,
  workspaceId,
  isOpen,
  onClose,
}: PublishModalProps) {
  const [activeTab, setActiveTab] = useState<"publish" | "domains" | "deployments" | "forms">("publish");
  const [vercelToken, setVercelToken] = useState("");
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [domainFeedback, setDomainFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const [showConfirmPublish, setShowConfirmPublish] = useState(false);
  const [showFailedDeployments, setShowFailedDeployments] = useState(false);
  const [jobProgress, setJobProgress] = useState<{
    progress: number;
    message: string;
    status: string;
    url?: string;
    deploymentUrl?: string;
    error?: string;
  }>({
    progress: 0,
    message: "",
    status: "idle",
  });

  const utils = trpc.useUtils();

  // Queries
  const preflightQuery = trpc.publish.preflight.useQuery(
    { siteId },
    { enabled: isOpen, refetchOnWindowFocus: false }
  );

  const integrationQuery = trpc.publish.getIntegration.useQuery(
    { workspaceId },
    { enabled: isOpen }
  );

  const publishStatusQuery = trpc.publish.getPublishStatus.useQuery(
    { siteId },
    { enabled: isOpen }
  );

  const domainsQuery = trpc.domains.get.useQuery(
    { siteId },
    { enabled: isOpen && activeTab === "domains" }
  );

  const deploymentsQuery = trpc.publish.listDeployments.useQuery(
    { siteId },
    { enabled: isOpen && activeTab === "deployments" }
  );

  const formsQuery = trpc.forms.listSubmissions.useQuery(
    { siteId },
    { enabled: isOpen && activeTab === "forms" }
  );

  // Mutations
  const addDomainMutation = trpc.domains.add.useMutation({
    onSuccess: () => {
      setCustomDomainInput("");
      setDomainFeedback({ type: "success", message: "Domain added! Configure your DNS records below." });
      void utils.domains.get.invalidate({ siteId });
      void utils.publish.getPublishStatus.invalidate({ siteId });
    },
    onError: (err) => {
      setDomainFeedback({ type: "error", message: sanitizeVercelError(err.message || "Failed to add domain.") });
    },
  });

  const verifyDomainMutation = trpc.domains.verify.useMutation({
    onSuccess: (data) => {
      if (data.verified) {
        setDomainFeedback({ type: "success", message: "Domain verified and SSL is ready!" });
      } else if (data.error) {
        setDomainFeedback({ type: "error", message: sanitizeVercelError(data.error) });
      } else {
        setDomainFeedback({ type: "success", message: "DNS checked: Still propagating at registrar. Please check again in a few minutes." });
      }
      void utils.domains.get.invalidate({ siteId });
      void utils.publish.getPublishStatus.invalidate({ siteId });
    },
    onError: (err) => {
      setDomainFeedback({ type: "error", message: sanitizeVercelError(err.message || "Failed to verify domain.") });
    },
  });

  const removeDomainMutation = trpc.domains.remove.useMutation({
    onSuccess: () => {
      setDomainFeedback({ type: "success", message: "Domain removed." });
      void utils.domains.get.invalidate({ siteId });
      void utils.publish.getPublishStatus.invalidate({ siteId });
    },
    onError: (err) => {
      setDomainFeedback({ type: "error", message: sanitizeVercelError(err.message || "Failed to remove domain.") });
    },
  });

  // Mutations
  const connectMutation = trpc.publish.connect.useMutation({
    onSuccess: () => {
      void utils.publish.getIntegration.invalidate({ workspaceId });
      void utils.publish.preflight.invalidate({ siteId });
      void utils.publish.getPublishStatus.invalidate({ siteId });
      setVercelToken("");
    },
  });

  const publishMutation = trpc.publish.publish.useMutation({
    onSuccess: (data) => {
      setPublishJobId(data.jobId);
      setShowConfirmPublish(false);
      setJobProgress({
        progress: 10,
        message: "Publishing job enqueued...",
        status: "running",
      });
      void utils.publish.getPublishStatus.invalidate({ siteId });
      void utils.domains.get.invalidate({ siteId });
    },
  });

  const rollbackMutation = trpc.publish.rollback.useMutation({
    onSuccess: (data) => {
      void utils.publish.listDeployments.invalidate({ siteId });
      void utils.publish.getPublishStatus.invalidate({ siteId });
      void utils.sites.get.invalidate({ siteId });
      if (data.promoted) {
        alert("Site successfully rolled back and promoted to production on Vercel!");
      } else {
        alert("Rollback rebuild job enqueued on Vercel edge.");
      }
    },
  });

  const fillStockPhotosMutation = trpc.sites.fillStockPhotos.useMutation({
    onSuccess: (data) => {
      void utils.publish.preflight.invalidate({ siteId });
      void utils.sites.get.invalidate({ siteId });
      if (data.filled > 0) {
        alert(`Successfully filled ${data.filled} image slot(s) with stock photos!`);
      } else if (data.rateLimited) {
        alert("Unsplash rate limit reached (429). Please try again shortly.");
      } else {
        alert("No stock photos found matching image queries.");
      }
    },
    onError: (err) => {
      alert(`Could not fill stock photos: ${err.message}`);
    },
  });

  // Listen to SSE progress when job is active
  useEffect(() => {
    if (!publishJobId) return;

    const eventSource = new EventSource(`/api/jobs/${publishJobId}/events`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === "connected") return;

        const rawMsg = sanitizeVercelError(payload.message || payload.error || "");
        const errDetail = sanitizeVercelError(payload.error || payload.message || "");

        setJobProgress({
          progress: payload.progress ?? 0,
          message: rawMsg || (payload.status === "failed" ? "Deployment failed on Vercel edge." : ""),
          status: payload.status,
          url: payload.output?.url,
          deploymentUrl: payload.output?.deploymentUrl,
          error: errDetail,
        });

        if (payload.status === "succeeded" || payload.status === "failed") {
          eventSource.close();
          void utils.publish.listDeployments.invalidate({ siteId });
          void utils.publish.getPublishStatus.invalidate({ siteId });
          void utils.domains.get.invalidate({ siteId });
        }
      } catch (e) {
        console.error("SSE parse error", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [publishJobId, siteId, utils]);

  if (!isOpen) return null;

  const preflight = preflightQuery.data;
  const isVercelConnected = integrationQuery.data?.connected;
  const pubStatus = publishStatusQuery.data;

  const isVercelExpiredOrRevoked =
    Boolean((integrationQuery.data as any)?.isExpiredOrRevoked) ||
    Boolean(
      preflight?.errors?.some((e) =>
        e.message?.includes("expired or was revoked") ||
        e.message?.toLowerCase().includes("not authorized") ||
        e.code === "PUB_VERCEL_AUTH_EXPIRED"
      )
    ) ||
    Boolean(
      jobProgress.error && (
        jobProgress.error.includes("expired or was revoked") ||
        jobProgress.error.toLowerCase().includes("not authorized") ||
        jobProgress.error.toLowerCase().includes("scope")
      )
    ) ||
    Boolean(
      domainFeedback?.message && (
        domainFeedback.message.includes("expired or was revoked") ||
        domainFeedback.message.toLowerCase().includes("not authorized")
      )
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="flex h-[600px] w-full max-w-2xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">
              ▲
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Publish to Vercel</h2>
              <p className="text-xs text-neutral-400">
                Generate static distribution & deploy to global edge
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 px-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab("publish")}
            className={`border-b-2 py-3 px-3 transition-colors ${
              activeTab === "publish"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            Publish
          </button>
          <button
            onClick={() => setActiveTab("domains")}
            className={`border-b-2 py-3 px-3 transition-colors ${
              activeTab === "domains"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            Custom Domain
          </button>
          <button
            onClick={() => setActiveTab("deployments")}
            className={`border-b-2 py-3 px-3 transition-colors ${
              activeTab === "deployments"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            Deployments & Rollback
          </button>
          <button
            onClick={() => setActiveTab("forms")}
            className={`border-b-2 py-3 px-3 transition-colors ${
              activeTab === "forms"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            Form Submissions
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-neutral-200">
          {/* Expired/Revoked Vercel Warning Banner - Rendered across EVERY publish tab */}
          {isVercelExpiredOrRevoked && (
            <div
              data-testid="vercel-expired-warning"
              className="mb-6 flex items-center justify-between rounded-lg border border-red-500/40 bg-red-950/60 p-4 text-xs text-red-200 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="font-semibold text-white">Vercel Connection Expired</p>
                  <p className="text-red-300">
                    Your Vercel connection has expired or was revoked. Reconnect Vercel in Settings → Integrations.
                  </p>
                </div>
              </div>
              <a
                href="/settings"
                data-testid="reconnect-vercel-btn"
                className="shrink-0 rounded bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500 transition"
              >
                Reconnect
              </a>
            </div>
          )}

          {activeTab === "publish" && (
            <div className="space-y-6">
              {/* Vercel Connection Section */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isVercelConnected ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="font-medium text-white">
                      {isVercelConnected
                        ? "Vercel Connected"
                        : "Vercel Not Connected"}
                    </span>
                  </div>
                  {isVercelConnected && (
                    <span className="text-xs text-emerald-400">Ready to deploy</span>
                  )}
                </div>

                {!isVercelConnected && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-neutral-400">
                      Enter your Vercel personal access token to authorize deployments.
                      Commercial projects require Vercel Pro.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Vercel Access Token (e.g., abc123xyz...)"
                        value={vercelToken}
                        onChange={(e) => setVercelToken(e.target.value)}
                        className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() =>
                          connectMutation.mutate({
                            workspaceId,
                            token: vercelToken,
                          })
                        }
                        disabled={!vercelToken.trim() || connectMutation.isPending}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {connectMutation.isPending ? "Connecting..." : "Connect"}
                      </button>
                    </div>
                    {connectMutation.error && (
                      <p className="text-xs text-red-400">
                        {connectMutation.error.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Preflight Checks */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Pre-flight Checks (PUB-001)
                </h3>
                {preflightQuery.isLoading ? (
                  <div className="text-xs text-neutral-400">Running checks...</div>
                ) : preflight ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={preflight.passed ? "text-emerald-400" : "text-red-400"}>
                        {preflight.passed ? "✓" : "✗"}
                      </span>
                      <span>
                        {preflight.passed
                          ? "All pre-flight checks passed"
                          : `${preflight.errors.length} issue(s) detected`}
                      </span>
                    </div>
                    {preflight.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 rounded bg-red-950/40 border border-red-900/60 p-2 text-xs text-red-300"
                      >
                        <div>• [{err.code}] {err.message}</div>
                        {err.code === "PUB_NO_VERCEL_CONNECTION" && (
                          <a
                            href="/settings"
                            data-testid="connect-vercel-btn"
                            className="shrink-0 rounded bg-red-600 hover:bg-red-500 text-white font-medium px-2.5 py-1 text-[11px] transition"
                          >
                            Connect Vercel
                          </a>
                        )}
                      </div>
                    ))}
                    {preflight.warnings.map((warn, i) => {
                      const isImageWarning = warn.includes("no photo");
                      return (
                        <div
                          key={i}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded bg-amber-950/40 border border-amber-900/60 p-2 text-xs text-amber-300"
                        >
                          <div>⚠ {warn}</div>
                          {isImageWarning && (
                            <div className="flex items-center gap-2 shrink-0">
                              {(preflight as any).hasUnsplash && (
                                <button
                                  type="button"
                                  onClick={() => fillStockPhotosMutation.mutate({ siteId })}
                                  disabled={fillStockPhotosMutation.isPending}
                                  className="rounded bg-amber-600 hover:bg-amber-500 text-white font-medium px-2.5 py-1 text-[11px] transition disabled:opacity-50"
                                >
                                  {fillStockPhotosMutation.isPending
                                    ? "Filling photos..."
                                    : "Fill with stock photos"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (publishStatusQuery.data?.isPublished) {
                                    setShowConfirmPublish(true);
                                  } else {
                                    publishMutation.mutate({ siteId });
                                  }
                                }}
                                disabled={publishMutation.isPending}
                                className="rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium px-2.5 py-1 text-[11px] transition"
                              >
                                Publish anyway
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Job Progress */}
              {publishJobId && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Publishing Progress</span>
                    <span className="text-neutral-400">{jobProgress.progress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${jobProgress.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-neutral-300">{jobProgress.message}</p>

                  {jobProgress.url && (
                    <div className="mt-2 rounded bg-emerald-950/40 border border-emerald-800/60 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-400">Site is Live!</span>
                      </div>
                      <div>
                        <a
                          href={jobProgress.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-white underline break-all hover:text-emerald-300"
                        >
                          {jobProgress.url} ↗
                        </a>
                      </div>
                      {jobProgress.deploymentUrl && jobProgress.deploymentUrl !== jobProgress.url && (
                        <p className="text-[11px] text-neutral-400">
                          Deployment URL:{" "}
                          <a
                            href={jobProgress.deploymentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-300 underline hover:text-white"
                          >
                            {jobProgress.deploymentUrl}
                          </a>
                        </p>
                      )}
                      <div className="mt-2 pt-2 border-t border-emerald-900/40 text-[11px] text-neutral-400">
                        <span className="font-semibold text-neutral-300">Note: </span>
                        If your Vercel project has Deployment Protection enabled, visitors may see a login prompt. You can adjust this in your Vercel Project Settings &gt; Deployment Protection.
                      </div>
                    </div>
                  )}

                  {jobProgress.status === "failed" && (
                    <div className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-red-400">Publishing Failed</div>
                          <p className="mt-1 text-xs text-red-200">
                            {jobProgress.message || jobProgress.error || "An unexpected error occurred during Vercel deployment."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => publishMutation.mutate({ siteId })}
                          disabled={publishMutation.isPending}
                          className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors shadow flex-shrink-0"
                        >
                          {publishMutation.isPending ? "Retrying..." : "Retry"}
                        </button>
                      </div>

                      {jobProgress.error && (
                        <details className="text-xs text-neutral-400 cursor-pointer pt-1 border-t border-red-900/30">
                          <summary className="text-[11px] font-medium text-neutral-400 hover:text-neutral-300">
                            Technical Details
                          </summary>
                          <pre className="mt-2 max-h-36 overflow-auto rounded bg-neutral-950 p-2 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
                            {jobProgress.error}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Already Published Overview Card */}
              {pubStatus?.isPublished && pubStatus.liveUrl && !jobProgress.url && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span className="text-xs font-semibold text-white">Live Website</span>
                    </div>
                    {pubStatus.lastPublishedAt && (
                      <span className="text-[11px] text-neutral-400">
                        Last published {formatTimeAgo(new Date(pubStatus.lastPublishedAt))}
                      </span>
                    )}
                  </div>
                  <div>
                    <a
                      href={pubStatus.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-emerald-400 hover:text-emerald-300 underline break-all"
                    >
                      {pubStatus.liveUrl} ↗
                    </a>
                  </div>
                  {pubStatus.deploymentUrl && pubStatus.deploymentUrl !== pubStatus.liveUrl && (
                    <p className="text-[11px] text-neutral-400">
                      Deployment URL:{" "}
                      <a
                        href={pubStatus.deploymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-300 underline hover:text-white"
                      >
                        {pubStatus.deploymentUrl}
                      </a>
                    </p>
                  )}
                  <div className="pt-1 text-[11px] text-neutral-400">
                    <span className="text-neutral-300">Deployment Protection: </span>
                    If your Vercel project has Deployment Protection enabled, visitors might see a login prompt. You can adjust this in Vercel Project Settings &gt; Deployment Protection.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "domains" && (
            <div className="space-y-6">
              {domainFeedback && (
                <div
                  className={`rounded-lg p-3 text-xs ${
                    domainFeedback.type === "success"
                      ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                      : "bg-red-950/40 border border-red-500/30 text-red-300"
                  }`}
                >
                  {domainFeedback.message}
                </div>
              )}

              {/* Check if site was published first */}
              {domainsQuery.data && !domainsQuery.data.isPublished ? (
                <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <span className="text-base">ℹ</span>
                    <span>Publish Required First</span>
                  </div>
                  <p className="text-xs text-neutral-300">
                    Publish the site first to connect a domain. Once deployed to Vercel edge, you can assign custom domains and configure DNS records.
                  </p>
                  <div>
                    <button
                      onClick={() => setActiveTab("publish")}
                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Go to Publish tab
                    </button>
                  </div>
                </div>
              ) : !domainsQuery.data?.hasVercel ? (
                <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <span className="text-base">⚠</span>
                    <span>Vercel Integration Required</span>
                  </div>
                  <p className="text-xs text-neutral-300">
                    To bind custom domains to your live website, you must first connect your Vercel account in workspace settings.
                  </p>
                  <div>
                    <a
                      href="/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 hover:text-white"
                    >
                      <span>Open Workspace Settings & Integrations</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              ) : domainsQuery.data?.domain ? (
                <div className="space-y-5">
                  {/* Domain Overview Card */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white">
                            {domainsQuery.data.domain.hostname}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                              domainsQuery.data.domain.sslStatus === "ready"
                                ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                                : domainsQuery.data.domain.sslStatus === "error"
                                ? "bg-red-950/60 text-red-300 border-red-500/30"
                                : "bg-amber-950/60 text-amber-300 border-amber-500/30"
                            }`}
                          >
                            {domainsQuery.data.domain.sslStatus === "ready"
                              ? "✓ Verified & SSL ready"
                              : domainsQuery.data.domain.sslStatus === "error"
                              ? "✗ Error"
                              : "⏳ Pending DNS"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-neutral-400">
                          {domainsQuery.data.domain.sslStatus === "ready"
                            ? "Your domain is fully configured, verified, and routing edge traffic over HTTPS."
                            : "Set up the DNS records below at your domain registrar, then click 'Check again'."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => verifyDomainMutation.mutate({ siteId })}
                          disabled={verifyDomainMutation.isPending}
                          className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 hover:text-white disabled:opacity-50"
                        >
                          {verifyDomainMutation.isPending ? "Checking..." : "Check again"}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Are you sure you want to remove this custom domain?")) {
                              removeDomainMutation.mutate({ siteId });
                            }
                          }}
                          disabled={removeDomainMutation.isPending}
                          className="rounded border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40 disabled:opacity-50"
                        >
                          {removeDomainMutation.isPending ? "Removing..." : "Remove domain"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Required DNS Records Table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                      Required DNS Records
                    </h4>

                    {((domainsQuery.data.domain.verificationRecords as any[]) || []).length > 0 ? (
                      <>
                        <p className="text-xs text-neutral-400">
                          Add the following records in your domain registrar's DNS panel (e.g. Cloudflare, Namecheap, GoDaddy):
                        </p>

                        <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-neutral-800 bg-neutral-900/50 text-neutral-400">
                              <tr>
                                <th className="py-2 px-3 font-medium">Type</th>
                                <th className="py-2 px-3 font-medium">Name / Host</th>
                                <th className="py-2 px-3 font-medium">Value / Target</th>
                                <th className="py-2 px-3 font-medium">Purpose</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800/60 text-neutral-300">
                              {((domainsQuery.data.domain.verificationRecords as any[]) || []).map((rec, idx) => (
                                <tr key={idx} className="hover:bg-neutral-900/30">
                                  <td className="py-2 px-3 font-mono text-emerald-400">{rec.type}</td>
                                  <td className="py-2 px-3 font-mono text-white">{rec.name}</td>
                                  <td className="py-2 px-3 font-mono text-neutral-200 select-all">{rec.value}</td>
                                  <td className="py-2 px-3 text-neutral-400">{rec.reason || "Vercel Routing"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-300">
                        <div className="flex items-center gap-2 font-medium text-amber-400">
                          <span>ℹ</span>
                          <span>No DNS records returned by Vercel</span>
                        </div>
                        <p className="mt-1 text-neutral-400">
                          Vercel did not return specific DNS records or verification challenges for this domain. Please check your Vercel project dashboard to view the domain status and DNS requirements.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-white">Add a Custom Domain</h4>
                    <p className="mt-1 text-xs text-neutral-400">
                      Enter the domain or subdomain where you want this site to be hosted.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. mybrand.com or www.mybrand.com"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value)}
                      className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => {
                        if (customDomainInput.trim()) {
                          addDomainMutation.mutate({ siteId, hostname: customDomainInput.trim() });
                        }
                      }}
                      disabled={!customDomainInput.trim() || addDomainMutation.isPending}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {addDomainMutation.isPending ? "Adding..." : "Add Domain"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "deployments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Deployment History
                </h3>
                <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFailedDeployments}
                    onChange={(e) => setShowFailedDeployments(e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-0"
                  />
                  <span>Show failed</span>
                </label>
              </div>

              {deploymentsQuery.isLoading ? (
                <div className="text-xs text-neutral-400">Loading deployments...</div>
              ) : deploymentsQuery.data?.length === 0 ? (
                <div className="text-xs text-neutral-500">No deployments yet.</div>
              ) : (
                <div className="space-y-2">
                  {deploymentsQuery.data
                    ?.filter((dep) => showFailedDeployments || dep.status !== "error")
                    .map((dep, index) => {
                      const isLive =
                        dep.id === pubStatus?.activeDeploymentId ||
                        (!pubStatus?.activeDeploymentId &&
                          dep.status === "ready" &&
                          index === 0);
                      const isRollback =
                        dep.logs?.includes("Rollback to") ||
                        dep.logs?.toLowerCase().includes("rollback");

                      return (
                        <div
                          key={dep.id}
                          className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  dep.status === "ready"
                                    ? "bg-emerald-400"
                                    : dep.status === "error"
                                    ? "bg-red-400"
                                    : "bg-amber-400"
                                }`}
                              />
                              <span className="font-semibold text-white capitalize">
                                {dep.status}
                              </span>
                              {isLive && (
                                <span className="rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                                  LIVE
                                </span>
                              )}
                              {isRollback && (
                                <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium">
                                  {dep.logs?.match(/Rollback to [^—)]+/)?.[0] || "Rollback version"}
                                </span>
                              )}
                              <span className="text-neutral-500">
                                {new Date(dep.createdAt).toLocaleString()}
                              </span>
                            </div>

                            {dep.status === "ready" && dep.versionId && !isLive && (
                              <button
                                onClick={() =>
                                  rollbackMutation.mutate({
                                    siteId,
                                    deploymentId: dep.id,
                                  })
                                }
                                disabled={rollbackMutation.isPending}
                                className="rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700 hover:text-white"
                              >
                                {rollbackMutation.isPending ? "Rolling back..." : "Rollback to this"}
                              </button>
                            )}
                          </div>

                          {dep.url && (
                            <a
                              href={dep.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-neutral-400 hover:text-white underline block break-all"
                            >
                              {dep.url}
                            </a>
                          )}

                          {dep.status === "error" && dep.logs && (
                            <details className="mt-1 text-xs text-red-300">
                              <summary className="cursor-pointer text-red-400 hover:text-red-300 font-medium">
                                Error details (expand)
                              </summary>
                              <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-neutral-900 p-2 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
                                {dep.logs}
                              </pre>
                            </details>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {activeTab === "forms" && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Visitor Form Submissions
              </h3>
              {formsQuery.isLoading ? (
                <div className="text-xs text-neutral-400">Loading submissions...</div>
              ) : formsQuery.data?.length === 0 ? (
                <div className="text-xs text-neutral-500">
                  No form submissions received yet. Forms on your published site post here.
                </div>
              ) : (
                <div className="space-y-2">
                  {formsQuery.data?.map((sub) => (
                    <div
                      key={sub.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-neutral-400">
                        <span className="font-medium text-white">Form: {sub.formId}</span>
                        <span>{new Date(sub.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-2 rounded bg-neutral-900 p-2 font-mono text-neutral-300">
                        <pre className="text-[11px] overflow-x-auto">
                          {JSON.stringify(sub.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-800 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            Close
          </button>

          {activeTab === "publish" && (
            <div className="flex items-center gap-3">
              {pubStatus?.isPublished && pubStatus.lastPublishedAt && (
                <div className="text-right text-xs hidden sm:block">
                  <span className="text-neutral-400">Last published </span>
                  <span className="text-neutral-200 font-medium">
                    {formatTimeAgo(new Date(pubStatus.lastPublishedAt))}
                  </span>
                  {pubStatus.liveUrl && (
                    <a
                      href={pubStatus.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-emerald-400 underline hover:text-white"
                    >
                      View live ↗
                    </a>
                  )}
                </div>
              )}

              {!pubStatus?.isPublished ? (
                <button
                  onClick={() => publishMutation.mutate({ siteId })}
                  disabled={
                    !preflight?.passed ||
                    publishMutation.isPending ||
                    jobProgress.status === "running"
                  }
                  className="flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  <span>▲</span>
                  <span>
                    {publishMutation.isPending || jobProgress.status === "running"
                      ? "Publishing..."
                      : "Publish site"}
                  </span>
                </button>
              ) : pubStatus.isUpToDate ? (
                <div className="flex items-center gap-2">
                  <button
                    disabled
                    className="flex items-center gap-2 rounded bg-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-400 cursor-not-allowed border border-neutral-700"
                  >
                    <span>✓</span>
                    <span>Up to date</span>
                  </button>
                  <button
                    onClick={() => setShowConfirmPublish(true)}
                    disabled={publishMutation.isPending || jobProgress.status === "running"}
                    className="text-xs text-neutral-400 underline hover:text-emerald-400 disabled:opacity-50"
                  >
                    Publish anyway
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmPublish(true)}
                  disabled={
                    !preflight?.passed ||
                    publishMutation.isPending ||
                    jobProgress.status === "running"
                  }
                  className="flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  <span>▲</span>
                  <span>
                    {publishMutation.isPending || jobProgress.status === "running"
                      ? "Publishing..."
                      : "Update live site"}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmPublish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">Replace Live Version?</h3>
            <p className="text-xs text-neutral-300">
              Your latest draft changes will be deployed to your live website{" "}
              <span className="font-semibold text-emerald-400">{pubStatus?.liveUrl || "on Vercel"}</span>.
              These changes will be immediately visible to visitors.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmPublish(false)}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmPublish(false);
                  publishMutation.mutate({ siteId });
                }}
                disabled={publishMutation.isPending}
                className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Confirm &amp; Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
