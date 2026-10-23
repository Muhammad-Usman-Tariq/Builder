"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../../lib/trpc";

interface AiCreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function AiCreateSiteModal({
  isOpen,
  onClose,
  workspaceId,
}: AiCreateSiteModalProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [prompt, setPrompt] = useState("");
  const [siteName, setSiteName] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "failed" | "succeeded">("idle");
  const [jobProgress, setJobProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState("");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: aiStatus } = trpc.ai.status.useQuery(
    { workspaceId },
    {
      enabled: isOpen && !!workspaceId,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }
  );
  const isAiAvailable = aiStatus?.configured ?? false;

  const createSiteMutation = trpc.sites.create.useMutation();
  const generateSiteMutation = trpc.ai.generateSite.useMutation();

  // Cleanup EventSource on unmount or close
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleStartGeneration = async () => {
    if (!prompt.trim()) return;

    if (!isAiAvailable) {
      setErrorReason("AI is not configured — add AI_MODEL_CHAIN and provider API keys to .env");
      setJobStatus("failed");
      return;
    }

    setJobStatus("running");
    setJobProgress(10);
    setJobMessage("Analyzing prompt & generating site plan...");
    setErrorReason(null);

    try {
      const name = siteName.trim() || prompt.slice(0, 30) + "...";
      // 1. Create site record
      const site = await createSiteMutation.mutateAsync({
        workspaceId,
        name,
      });

      if (!site?.id) throw new Error("Failed to create site");

      // 2. Enqueue AI generation
      const enqueueRes = await generateSiteMutation.mutateAsync({
        workspaceId,
        siteId: site.id,
        prompt: prompt.trim(),
      });

      const jobId = enqueueRes.jobId;
      if (!jobId) throw new Error("No job ID returned from AI generator");

      // 3. Connect to live SSE progress stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const sse = new EventSource(`/api/jobs/${jobId}/events`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (typeof parsed.progress === "number") {
            setJobProgress(parsed.progress);
          }
          if (parsed.message) {
            setJobMessage(parsed.message);
          }

          if (parsed.status === "succeeded") {
            sse.close();
            eventSourceRef.current = null;
            setJobStatus("succeeded");
            setJobProgress(100);
            setJobMessage("Site generated successfully! Loading editor...");
            utils.sites.list.invalidate();
            setTimeout(() => {
              router.push(`/editor/${site.id}`);
              onClose();
            }, 600);
          } else if (parsed.status === "failed") {
            sse.close();
            eventSourceRef.current = null;
            setJobStatus("failed");
            setErrorReason(parsed.error || parsed.message || "AI generation failed");
          }
        } catch {
          // ignore stream parse errors
        }
      };

      sse.onerror = () => {
        // Fallback: poll job status once if stream connection drops
        fetch(`/api/jobs/${jobId}/status`)
          .then((res) => res.json())
          .then((job) => {
            if (job.status === "succeeded") {
              sse.close();
              eventSourceRef.current = null;
              router.push(`/editor/${site.id}`);
              onClose();
            } else if (job.status === "failed") {
              sse.close();
              eventSourceRef.current = null;
              setJobStatus("failed");
              setErrorReason(job.error || "Generation job failed");
            }
          })
          .catch(() => {});
      };
    } catch (err: any) {
      console.error("[AI] Generation initiation failed:", err);
      setJobStatus("failed");
      setErrorReason(err?.message || "Failed to start AI generation");
    }
  };

  const handleClose = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setJobStatus("idle");
    setErrorReason(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400 font-bold">
              ✦
            </span>
            <h3 className="text-base font-semibold">Build Website with AI</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={jobStatus === "running"}
            className="text-neutral-400 hover:text-white disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <p className="mt-2 text-xs text-neutral-400">
          Describe the business, audience, and features you want. The AI will generate custom design tokens, a multi-page sitemap, and tailored sections.
        </p>

        {!isAiAvailable && (
          <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            <div className="font-semibold text-amber-300">AI is not configured</div>
            <div className="mt-0.5 text-amber-400/80">
              Add AI_MODEL_CHAIN and provider API keys to .env to enable AI website generation.
            </div>
          </div>
        )}

        {/* Live Progress View */}
        {jobStatus === "running" && (
          <div className="mt-6 rounded-xl border border-blue-900/40 bg-neutral-950/80 p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-300 mb-2">
              <span className="flex items-center gap-2 text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                Generating Website
              </span>
              <span className="font-mono text-neutral-400">{jobProgress}%</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300 ease-out"
                style={{ width: `${Math.max(5, Math.min(100, jobProgress))}%` }}
              />
            </div>

            <p className="mt-3 text-xs text-neutral-300 break-words leading-relaxed">
              {jobMessage || "Crafting layout and sections..."}
            </p>
          </div>
        )}

        {/* Error / Failure View with Retry */}
        {jobStatus === "failed" && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs text-red-200">
            <div className="font-semibold text-red-300 flex items-center gap-1.5 mb-1">
              <span>⚠</span> Generation Failed
            </div>
            <p className="text-red-300/90 leading-relaxed">
              {errorReason || "An unexpected error occurred during AI website generation."}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartGeneration}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Retry Generation
              </button>
              <button
                type="button"
                onClick={() => setJobStatus("idle")}
                className="rounded-lg border border-red-800/60 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/30"
              >
                Edit Prompt
              </button>
            </div>
          </div>
        )}

        {/* Form (only editable when not running) */}
        {jobStatus !== "running" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleStartGeneration();
            }}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">
                Website Name (Optional)
              </label>
              <input
                type="text"
                data-testid="ai-site-name-input"
                placeholder="e.g. Roasters Lab Cafe"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">
                What kind of website are you building?
              </label>
              <textarea
                rows={4}
                required
                data-testid="ai-prompt-input"
                placeholder="e.g. An artisan specialty coffee shop in Lahore with single-origin beans, a seasonal bakery menu, customer testimonials, and an online table reservation form."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="ai-generate-submit-btn"
                disabled={!prompt.trim() || !isAiAvailable}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
              >
                Generate Website →
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
