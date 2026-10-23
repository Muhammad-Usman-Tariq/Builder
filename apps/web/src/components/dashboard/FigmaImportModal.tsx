"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "../../lib/trpc";

interface FigmaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function FigmaImportModal({
  isOpen,
  onClose,
  workspaceId,
}: FigmaImportModalProps) {
  const router = useRouter();
  const [urlOrKey, setUrlOrKey] = useState("");
  const [patToken, setPatToken] = useState("");
  const [siteName, setSiteName] = useState("");
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isFetchingFrames, setIsFetchingFrames] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [frames, setFrames] = useState<Array<{ id: string; name: string; width: number; height: number }>>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<{
    imported: number;
    approximated: number;
    skipped: number;
    warnings: string[];
  } | null>(null);
  const [createdSiteId, setCreatedSiteId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: figmaStatus } = trpc.integrations.getFigma.useQuery(
    { workspaceId },
    { enabled: isOpen && !!workspaceId }
  );

  const connectMutation = trpc.integrations.connectFigma.useMutation({
    onSuccess: () => {
      setPatToken("");
      void utils.integrations.getFigma.invalidate({ workspaceId });
    },
  });

  const importMutation = trpc.integrations.importFigmaFrame.useMutation();

  if (!isOpen) return null;

  const isConnected = Boolean(figmaStatus?.connected);

  const handleFetchFrames = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlOrKey.trim()) return;

    setIsFetchingFrames(true);
    setError(null);
    setFrames([]);

    try {
      const res = await utils.integrations.listFigmaFrames.fetch({
        workspaceId,
        urlOrKey: urlOrKey.trim(),
      });
      setFileName(res.fileName);
      setFrames(res.frames);
      if (res.frames.length > 0) {
        setSelectedFrameId(res.frames[0]!.id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load frames from Figma file");
    } finally {
      setIsFetchingFrames(false);
    }
  };

  const handleImportFrame = async () => {
    if (!urlOrKey.trim() || !selectedFrameId) return;

    setIsImporting(true);
    setError(null);

    try {
      const res = await importMutation.mutateAsync({
        workspaceId,
        urlOrKey: urlOrKey.trim(),
        frameId: selectedFrameId,
        siteName: siteName.trim() || undefined,
      });

      setCreatedSiteId(res.site?.id || "");
      setImportReport(res.report);
    } catch (err: any) {
      setError(err?.message || "Failed to import Figma frame");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">❖</span>
            <h2 className="text-lg font-semibold text-white">Import from Figma</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting || isFetchingFrames}
            className="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {importReport ? (
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <span>✓</span>
                <span>Figma Frame Imported!</span>
              </div>
              <p className="mt-1 text-xs text-emerald-300">
                Converted Auto Layout flexboxes, typography, shapes, and responsive layout rules.
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs">
              <div className="font-semibold text-white mb-2">Import Report</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-neutral-900 p-2">
                  <div className="text-lg font-bold text-blue-400">{importReport.imported}</div>
                  <div className="text-[10px] text-neutral-400">Imported</div>
                </div>
                <div className="rounded bg-neutral-900 p-2">
                  <div className="text-lg font-bold text-amber-400">{importReport.approximated}</div>
                  <div className="text-[10px] text-neutral-400">Approximated</div>
                </div>
                <div className="rounded bg-neutral-900 p-2">
                  <div className="text-lg font-bold text-neutral-400">{importReport.skipped}</div>
                  <div className="text-[10px] text-neutral-400">Skipped</div>
                </div>
              </div>

              {importReport.warnings.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  <div className="font-semibold text-amber-400 text-[11px]">Warnings:</div>
                  {importReport.warnings.map((w, i) => (
                    <div key={i} className="text-[10px] text-neutral-400">
                      • {w}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  if (createdSiteId) router.push(`/editor/${createdSiteId}`);
                  onClose();
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                Open in Editor →
              </button>
            </div>
          </div>
        ) : !isConnected ? (
          /* Missing PAT token screen */
          <div className="mt-6 flex flex-col gap-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 text-xs text-amber-300">
              <div className="font-semibold text-amber-200 mb-1">Figma Token Required</div>
              Figma Personal Access Token (PAT) is not configured for this workspace. You can enter
              it below or configure it in{" "}
              <Link href="/settings" onClick={onClose} className="underline text-white font-medium">
                Workspace Settings
              </Link>
              .
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">Personal Access Token</label>
              <input
                type="password"
                placeholder="figd_..."
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500"
              />
              <span className="text-[10px] text-neutral-500">
                Stored encrypted with AES-256-GCM. Never exposed to browser clients.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!patToken.trim() || connectMutation.isPending}
                onClick={() => {
                  if (patToken.trim()) {
                    connectMutation.mutate({ workspaceId, token: patToken.trim() });
                  }
                }}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {connectMutation.isPending ? "Connecting..." : "Save & Connect"}
              </button>
            </div>
          </div>
        ) : (
          /* Connected screen: File URL & Frame Picker */
          <div className="mt-6 flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleFetchFrames} className="flex flex-col gap-2">
              <label className="text-xs font-medium text-neutral-300">
                Figma File URL or Key
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://www.figma.com/design/..."
                  value={urlOrKey}
                  onChange={(e) => setUrlOrKey(e.target.value)}
                  disabled={isFetchingFrames || isImporting}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!urlOrKey.trim() || isFetchingFrames || isImporting}
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                >
                  {isFetchingFrames ? "Loading..." : "Find Frames"}
                </button>
              </div>
            </form>

            {/* Frame Picker List */}
            {frames.length > 0 && (
              <div className="flex flex-col gap-3 pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-300">
                    Pick 1 Frame from {fileName}:
                  </span>
                  <span className="text-[10px] text-neutral-500">{frames.length} frames found</span>
                </div>

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {frames.map((frame) => {
                    const isSelected = selectedFrameId === frame.id;
                    return (
                      <div
                        key={frame.id}
                        onClick={() => setSelectedFrameId(frame.id)}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 text-xs transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-950/30 text-white font-medium"
                            : "border-neutral-800 bg-neutral-950/60 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frame-selection"
                            checked={isSelected}
                            onChange={() => setSelectedFrameId(frame.id)}
                            className="text-blue-600"
                          />
                          <span>{frame.name}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {frame.width}×{frame.height}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-300">
                    Website Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Portfolio"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    disabled={isImporting}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isImporting}
                    className="rounded-lg px-4 py-2 text-sm text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedFrameId || isImporting}
                    onClick={handleImportFrame}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {isImporting ? "Importing Frame..." : "Import Frame"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
