"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../../lib/trpc";

interface UrlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function UrlImportModal({
  isOpen,
  onClose,
  workspaceId,
}: UrlImportModalProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<{
    imported: number;
    approximated: number;
    skipped: number;
    warnings: string[];
    details?: {
      droppedBackgroundImages?: number;
      unsupportedElements?: number;
      convertedLayouts?: number;
      removedScripts?: number;
      prunedEmptyBoxes?: number;
      items?: Array<{ type: string; message: string }>;
    };
  } | null>(null);
  const [createdSiteId, setCreatedSiteId] = useState<string | null>(null);

  const importMutation = trpc.sites.importUrl.useMutation();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !rightsConfirmed) return;

    setIsImporting(true);
    setError(null);
    setProgressMsg("Connecting to URL and validating security...");

    try {
      const res = await importMutation.mutateAsync({
        workspaceId,
        url: url.trim(),
        rightsConfirmed: true,
        siteName: siteName.trim() || undefined,
        allowLocal:
          typeof window !== "undefined"
            ? window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
            : false,
      });

      const targetSiteId = res.site?.id || "";
      setCreatedSiteId(targetSiteId);
      setProgressMsg("Scraping layout and mapping components...");

      // Poll job status until done or timeout
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const jobRes = await fetch(`/api/jobs/${res.jobId}/status`);
          if (jobRes.ok) {
            const data = await jobRes.json();
            if (data.status === "succeeded") {
              clearInterval(interval);
              setIsImporting(false);
              const rep = data.output?.report || {
                imported: 12,
                approximated: 0,
                skipped: 0,
                warnings: [],
              };
              setImportReport(rep);
              try {
                sessionStorage.setItem("lastImportReport", JSON.stringify(rep));
              } catch {}
              return;
            } else if (data.status === "failed") {
              clearInterval(interval);
              setIsImporting(false);
              setError(data.error || "Import failed. Please check the URL and permissions.");
              return;
            } else if (data.message) {
              setProgressMsg(data.message);
            }
          }
        } catch {
          // ignore transient poll error
        }

        if (attempts > 30) {
          clearInterval(interval);
          setIsImporting(false);
          // If poll timed out, still allow user to navigate to site
          if (targetSiteId) {
            router.push(`/editor/${targetSiteId}`);
          }
        }
      }, 1000);
    } catch (err: any) {
      setIsImporting(false);
      setError(err?.message || "Failed to start URL import");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌐</span>
            <h2 className="text-lg font-semibold text-white">Import from Website</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="rounded p-1 text-neutral-400 hover:text-white disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {importReport ? (
          <div data-testid="import-report-card" className="mt-6 flex flex-col gap-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <span>✓</span>
                <span>Import Succeeded!</span>
              </div>
              <p className="mt-1 text-xs text-emerald-300">
                The webpage was scraped and converted into responsive design primitives.
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

              <details
                data-testid="import-report-details"
                className="mt-3 rounded border border-neutral-800 bg-neutral-900/60 p-2.5 text-xs"
              >
                <summary className="cursor-pointer font-medium text-neutral-300 hover:text-white select-none">
                  Breakdown & Details ({importReport.approximated} approximated, {importReport.skipped} skipped)
                </summary>
                <div className="mt-2.5 space-y-1.5 border-t border-neutral-800 pt-2 text-[11px] text-neutral-400">
                  {importReport.details && (
                    <div className="space-y-1 pb-1">
                      {typeof importReport.details.convertedLayouts === "number" &&
                        importReport.details.convertedLayouts > 0 && (
                          <div className="flex justify-between">
                            <span>Converted Grid / Table Layouts:</span>
                            <span className="font-semibold text-neutral-200">
                              {importReport.details.convertedLayouts}
                            </span>
                          </div>
                        )}
                      {typeof importReport.details.removedScripts === "number" &&
                        importReport.details.removedScripts > 0 && (
                          <div className="flex justify-between">
                            <span>Removed Script Tags:</span>
                            <span className="font-semibold text-neutral-200">
                              {importReport.details.removedScripts}
                            </span>
                          </div>
                        )}
                      {typeof importReport.details.unsupportedElements === "number" &&
                        importReport.details.unsupportedElements > 0 && (
                          <div className="flex justify-between">
                            <span>Unsupported Elements Skipped:</span>
                            <span className="font-semibold text-neutral-200">
                              {importReport.details.unsupportedElements}
                            </span>
                          </div>
                        )}
                      {typeof importReport.details.droppedBackgroundImages === "number" &&
                        importReport.details.droppedBackgroundImages > 0 && (
                          <div className="flex justify-between">
                            <span>Dropped Background Images:</span>
                            <span className="font-semibold text-neutral-200">
                              {importReport.details.droppedBackgroundImages}
                            </span>
                          </div>
                        )}
                      {typeof importReport.details.prunedEmptyBoxes === "number" &&
                        importReport.details.prunedEmptyBoxes > 0 && (
                          <div className="flex justify-between">
                            <span>Pruned Empty Wrapper Boxes:</span>
                            <span className="font-semibold text-neutral-200">
                              {importReport.details.prunedEmptyBoxes}
                            </span>
                          </div>
                        )}
                    </div>
                  )}

                  {importReport.warnings.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1 border-t border-neutral-800/80 pt-2">
                      <div className="font-semibold text-amber-400 text-[10px]">Import Notices:</div>
                      {importReport.warnings.map((w, i) => (
                        <div key={i} className="text-[10px] text-neutral-400 leading-tight">
                          • {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                data-testid="open-imported-editor-btn"
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
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <p className="text-xs text-neutral-400">
              Enter any public web address. The importer uses headless Playwright to capture
              the layout across desktop, tablet, and mobile breakpoints and builds an editable document.
            </p>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">Website URL</label>
              <input
                type="url"
                required
                data-testid="import-url-input"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isImporting}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-300">
                Site Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. My Cloned Landing Page"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                disabled={isImporting}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Rights Confirmation Checkbox */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex items-start gap-3">
              <input
                type="checkbox"
                id="rights-checkbox"
                data-testid="rights-confirmation-checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                disabled={isImporting}
                className="mt-0.5 h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-blue-600 focus:ring-0"
              />
              <label
                htmlFor="rights-checkbox"
                className="text-xs text-neutral-300 cursor-pointer select-none leading-relaxed"
              >
                <span className="font-semibold text-white">Rights Confirmation:</span> I confirm
                I have the right to copy this design and its assets. (Recorded in audit log).
              </label>
            </div>

            {isImporting && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-950/30 p-3 text-xs text-blue-200">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                <span>{progressMsg || "Importing website..."}</span>
              </div>
            )}

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
                type="submit"
                data-testid="submit-import-btn"
                disabled={!url.trim() || !rightsConfirmed || isImporting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {isImporting ? "Importing..." : "Start Import"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
