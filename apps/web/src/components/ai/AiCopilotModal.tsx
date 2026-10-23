"use client";

import React, { useState, useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { useEditorStore } from "@builder/editor-core";

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  siteId: string;
}

function findSectionId(elementId: string | null, elements: Record<string, any> | undefined): string | null {
  if (!elementId || !elements) return null;
  let curr = elements[elementId];
  while (curr) {
    if (curr.type === "Section") return curr.id;
    if (!curr.parentId) break;
    curr = elements[curr.parentId];
  }
  return null;
}

export function AiCopilotModal({
  isOpen,
  onClose,
  workspaceId,
  siteId,
}: AiCopilotModalProps) {
  const { doc, activePageId } = useEditorStore();

  // Snapshot selection at open time so losing focus/selection never clears target element
  const [capturedSelectedId, setCapturedSelectedId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"rewrite" | "section" | "chat">("rewrite");
  const [instruction, setInstruction] = useState("Make it concise and punchy");
  const [sectionPrompt, setSectionPrompt] = useState("Modern section with bold headline and clear call to action");
  const [chatPrompt, setChatPrompt] = useState("");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Section regeneration progress & preview state
  const [regProgress, setRegProgress] = useState(0);
  const [regMessage, setRegMessage] = useState("");
  const [regStatus, setRegStatus] = useState<"idle" | "running" | "succeeded" | "failed">("idle");
  const [regError, setRegError] = useState<string | null>(null);
  const [sectionPatch, setSectionPatch] = useState<any | null>(null);
  const [sectionPreviewSummary, setSectionPreviewSummary] = useState<string | null>(null);

  // Rewrite preview state
  const [rewritePreview, setRewritePreview] = useState<{ original: string; rewritten: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // When modal opens, capture active selection and choose appropriate tab
  useEffect(() => {
    if (isOpen) {
      const currentSelectedId = useEditorStore.getState().selectedId;
      setCapturedSelectedId(currentSelectedId);
      setSectionPatch(null);
      setSectionPreviewSummary(null);
      setRewritePreview(null);
      setRegStatus("idle");
      setRegError(null);
      setMessage(null);

      if (currentSelectedId && doc.elements) {
        const el = doc.elements[currentSelectedId];
        const isText =
          el &&
          (el.type === "Heading" ||
            el.type === "Text" ||
            el.type === "RichText" ||
            el.type === "Button");

        if (isText) {
          setActiveTab("rewrite");
        } else {
          const secId = findSectionId(currentSelectedId, doc.elements);
          if (secId) {
            setActiveTab("section");
          }
        }
      }
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  }, [isOpen, doc.elements]);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const selectedElement = capturedSelectedId ? doc.elements[capturedSelectedId] : null;
  const targetSectionId = findSectionId(capturedSelectedId, doc.elements);
  const targetSection = targetSectionId ? doc.elements[targetSectionId] : null;

  const isTextElement =
    selectedElement &&
    (selectedElement.type === "Heading" ||
      selectedElement.type === "Text" ||
      selectedElement.type === "RichText" ||
      selectedElement.type === "Button");

  const currentText = isTextElement
    ? String(selectedElement.props["text"] || "")
    : "";

  const { data: aiStatus } = trpc.ai.status.useQuery(
    { workspaceId },
    { enabled: isOpen && !!workspaceId }
  );
  const isAiAvailable = aiStatus?.configured ?? false;

  const { data: mcpToolsData } = trpc.ai.listExternalMcpTools.useQuery(
    { workspaceId },
    { enabled: isOpen && !!workspaceId }
  );

  const rewriteMutation = trpc.ai.rewriteText.useMutation();
  const regenerateSectionMutation = trpc.ai.regenerateSection.useMutation();
  const copilotChatMutation = trpc.ai.copilotChat.useMutation();

  if (!isOpen) return null;

  // Rewrite Text: shows preview with Accept / Reject
  const handleRewrite = async () => {
    if (!capturedSelectedId || !currentText.trim()) return;
    setIsProcessing(true);
    setMessage(null);
    setRewritePreview(null);

    try {
      const res = await rewriteMutation.mutateAsync({
        workspaceId,
        text: currentText,
        instruction,
      });

      setRewritePreview({
        original: currentText,
        rewritten: res.text,
      });
    } catch (err: any) {
      setMessage(`Failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAcceptRewrite = () => {
    if (!capturedSelectedId || !rewritePreview) return;
    const patch = {
      elements: {
        [capturedSelectedId]: {
          props: { text: rewritePreview.rewritten },
          origin: "ai" as const,
        },
      },
      origin: "ai" as const,
    };
    useEditorStore.getState().applyAiPatch(
      patch,
      `Rewrote ${selectedElement?.name || selectedElement?.type || "Text"}`
    );
    setRewritePreview(null);
    onClose();
  };

  const handleRejectRewrite = () => {
    setRewritePreview(null);
  };

  // Regenerate Section: live SSE progress -> preview with Accept / Reject -> applyAiPatch
  const handleRegenerateSection = async () => {
    const secId = targetSectionId;
    if (!secId || !sectionPrompt.trim()) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setRegStatus("running");
    setRegProgress(15);
    setRegMessage("Queuing section regeneration...");
    setRegError(null);
    setSectionPatch(null);
    setSectionPreviewSummary(null);

    try {
      const res = await regenerateSectionMutation.mutateAsync({
        workspaceId,
        siteId,
        pageId: activePageId,
        sectionId: secId,
        prompt: sectionPrompt,
      });

      const jobId = res.jobId;
      const sse = new EventSource(`/api/jobs/${jobId}/events`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (typeof payload.progress === "number") {
            setRegProgress(payload.progress);
          }
          if (payload.message) {
            setRegMessage(payload.message);
          }

          if (payload.status === "succeeded") {
            sse.close();
            eventSourceRef.current = null;
            setRegStatus("succeeded");
            setRegProgress(100);
            const patch = payload.output?.patch;
            setSectionPatch(patch);
            setSectionPreviewSummary(
              payload.output?.previewText || `Enhanced ${targetSection?.name || "Section"}`
            );
          } else if (payload.status === "failed") {
            sse.close();
            eventSourceRef.current = null;
            setRegStatus("failed");
            setRegError(
              payload.error || payload.message || "Section regeneration failed. Please try again."
            );
          }
        } catch {
          // ignore parsing error
        }
      };

      sse.onerror = () => {
        // SSE network error fallback
      };
    } catch (err: any) {
      setRegStatus("failed");
      setRegError(err?.message || "Failed to start section regeneration. Please try again.");
    }
  };

  const handleAcceptSection = () => {
    if (!sectionPatch) return;
    useEditorStore.getState().applyAiPatch(
      sectionPatch,
      `Regenerated ${targetSection?.name || "Section"}`
    );
    setSectionPatch(null);
    onClose();
  };

  const handleRejectSection = () => {
    setSectionPatch(null);
    setRegStatus("idle");
    setRegProgress(0);
    setRegMessage("");
  };

  const handleCopilotChat = async () => {
    if (!chatPrompt.trim()) return;
    setIsProcessing(true);
    setMessage(null);
    setChatReply(null);

    try {
      const res = await copilotChatMutation.mutateAsync({
        workspaceId,
        prompt: chatPrompt,
        selectedElementId: capturedSelectedId || undefined,
      });

      setChatReply(res.reply);
      setMessage(`Copilot responded (using ${res.toolsLoaded} external tools).`);
    } catch (err: any) {
      setMessage(`Failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600/30 text-purple-400 font-bold text-xs">
              ✦
            </span>
            <h3 className="text-sm font-semibold">AI Design Copilot</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>

        {/* Tab selection */}
        <div className="mt-3 flex gap-2 border-b border-neutral-800 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("rewrite")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTab === "rewrite"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Rewrite Text
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("section")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTab === "section"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Regenerate Section
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTab === "chat"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            Ask Copilot
          </button>
        </div>

        {!isAiAvailable && (
          <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/40 p-3 text-xs text-amber-200">
            <div className="font-semibold text-amber-300">AI is not configured</div>
            <div className="mt-0.5 text-amber-400/80">Add AI_MODEL_CHAIN and provider API keys to .env to enable AI features.</div>
          </div>
        )}

        {message && (
          <div className="mt-3 rounded border border-neutral-700 bg-neutral-800/80 p-2 text-xs text-neutral-200">
            {message}
          </div>
        )}

        {/* REWRITE TAB */}
        {activeTab === "rewrite" && (
          <div className="mt-3 flex flex-col gap-3">
            {rewritePreview ? (
              <div className="rounded-xl border border-purple-800/60 bg-purple-950/30 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-300">Preview AI Rewrite</span>
                  <span className="text-[10px] text-neutral-400">Review changes below</span>
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
                  <div className="text-[10px] text-neutral-500 uppercase font-semibold">Original</div>
                  <div className="mt-0.5 line-through italic">"{rewritePreview.original}"</div>
                </div>
                <div className="rounded border border-purple-700/60 bg-purple-950/50 p-2 text-xs text-purple-200">
                  <div className="text-[10px] text-purple-400 uppercase font-semibold">Rewritten</div>
                  <div className="mt-0.5 font-medium">"{rewritePreview.rewritten}"</div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="copilot-reject-btn"
                    onClick={handleRejectRewrite}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    data-testid="copilot-accept-btn"
                    onClick={handleAcceptRewrite}
                    className="rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors shadow"
                  >
                    Accept ✦
                  </button>
                </div>
              </div>
            ) : isTextElement ? (
              <>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-300">
                  <div className="text-[10px] text-neutral-500 uppercase font-semibold">
                    Current Text ({selectedElement?.name || selectedElement?.type})
                  </div>
                  <div className="mt-1 line-clamp-3 italic">"{currentText}"</div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-neutral-400">Tone / Instruction</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      "Make it punchy & concise",
                      "Professional & enterprise",
                      "Friendly & welcoming",
                      "Bold & high-converting",
                    ].map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setInstruction(tone)}
                        className={`rounded border border-neutral-800 p-1.5 text-left text-[11px] hover:border-neutral-700 ${
                          instruction === tone
                            ? "bg-purple-950/40 border-purple-500/50 text-purple-300"
                            : "bg-neutral-950 text-neutral-300"
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Custom instruction..."
                    className="mt-1 rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="copilot-rewrite-submit-btn"
                    disabled={isProcessing}
                    onClick={handleRewrite}
                    className="rounded bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
                  >
                    {isProcessing ? "Rewriting..." : "Apply AI Rewrite ✦"}
                  </button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-neutral-400">
                Please select an element first. Click a Heading, Text, or Button on the canvas to rewrite its text.
              </div>
            )}
          </div>
        )}

        {/* SECTION TAB */}
        {activeTab === "section" && (
          <div className="mt-3 flex flex-col gap-3">
            {sectionPatch ? (
              <div className="rounded-xl border border-purple-800/60 bg-purple-950/30 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-300">Preview Regenerated Section</span>
                  <span className="text-[10px] text-neutral-400">1 change ready to apply</span>
                </div>
                <div className="rounded border border-purple-700/60 bg-purple-950/50 p-2.5 text-xs text-purple-200">
                  <div className="text-[10px] text-purple-400 uppercase font-semibold">Summary of Changes</div>
                  <div className="mt-1 font-medium">{sectionPreviewSummary}</div>
                  <div className="mt-1 text-[11px] text-neutral-400">
                    Target: {targetSection?.name || "Section"} (ID: {targetSectionId})
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="copilot-reject-btn"
                    onClick={handleRejectSection}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    data-testid="copilot-accept-btn"
                    onClick={handleAcceptSection}
                    className="rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition-colors shadow"
                  >
                    Accept ✦
                  </button>
                </div>
              </div>
            ) : regStatus === "running" ? (
              <div data-testid="copilot-progress" className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-purple-300 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-400 animate-ping" />
                    Regenerating Section...
                  </span>
                  <span className="text-neutral-400 font-mono text-[11px]">{regProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-300"
                    style={{ width: `${regProgress}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-300">{regMessage || "Generating layout and content with AI..."}</p>
              </div>
            ) : regStatus === "failed" ? (
              <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 flex flex-col gap-3">
                <div className="text-xs font-semibold text-red-400">Regeneration Failed</div>
                <p className="text-xs text-red-200">
                  {regError || "An error occurred while regenerating the section. Please try again."}
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRegStatus("idle");
                      setRegError(null);
                    }}
                    className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    data-testid="copilot-retry-btn"
                    onClick={handleRegenerateSection}
                    className="rounded bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors shadow"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : targetSectionId ? (
              <>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-300">
                  <div className="text-[10px] text-neutral-500 uppercase font-semibold">
                    Target Section
                  </div>
                  <div className="mt-0.5 font-medium text-white">{targetSection?.name || "Section"}</div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-neutral-400">
                    How should this section be regenerated?
                  </label>
                  <textarea
                    rows={3}
                    data-testid="copilot-section-prompt-input"
                    placeholder="e.g. Modern dark theme hero with 3 statistics counters, dual call to actions, and social proof badges."
                    value={sectionPrompt}
                    onChange={(e) => setSectionPrompt(e.target.value)}
                    className="rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="copilot-regenerate-submit-btn"
                    disabled={isProcessing || !sectionPrompt.trim()}
                    onClick={handleRegenerateSection}
                    className="rounded bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
                  >
                    Regenerate Section ✦
                  </button>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-neutral-400">
                Please select an element first. Click a Section or any element inside a section on the canvas to regenerate it.
              </div>
            )}
          </div>
        )}

        {/* CHAT / COPILOT TAB */}
        {activeTab === "chat" && (
          <div className="mt-3 flex flex-col gap-3">
            {/* Show MCP Tools only in Ask Copilot, collapsed by default, and only when tools exist */}
            {mcpToolsData?.configured && (mcpToolsData?.tools?.length ?? 0) > 0 && (
              <details className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5 text-xs">
                <summary className="flex items-center justify-between text-[11px] text-neutral-400 cursor-pointer select-none">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="text-purple-400">🔌</span>
                    <span>Available External MCP Tools ({mcpToolsData.tools.length})</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono">Connected</span>
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5 pt-1 border-t border-neutral-800/80">
                  {mcpToolsData.tools.map((t) => (
                    <span
                      key={t.name}
                      title={t.description || t.name}
                      className="inline-flex items-center rounded-md bg-purple-950/50 px-2 py-0.5 text-[10px] font-mono text-purple-300 border border-purple-800/40"
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              </details>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-neutral-400">
                Ask Copilot (has access to external MCP tools)
              </label>
              <textarea
                rows={3}
                placeholder="Ask about design advice, copy suggestions, or actions using external MCP tools..."
                value={chatPrompt}
                onChange={(e) => setChatPrompt(e.target.value)}
                className="rounded border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500"
              />
            </div>

            {chatReply && (
              <div className="rounded border border-purple-900/40 bg-purple-950/20 p-2.5 text-xs text-neutral-200">
                <div className="text-[10px] uppercase font-semibold text-purple-400">
                  Copilot Response
                </div>
                <div className="mt-1 whitespace-pre-wrap">{chatReply}</div>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isProcessing || !chatPrompt.trim()}
                onClick={handleCopilotChat}
                className="rounded bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
              >
                {isProcessing ? "Thinking..." : "Send to Copilot ✦"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
