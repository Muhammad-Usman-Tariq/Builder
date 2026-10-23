"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../../lib/trpc";

interface ScreenshotImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function ScreenshotImportModal({
  isOpen,
  onClose,
  workspaceId,
}: ScreenshotImportModalProps) {
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [desktopImage, setDesktopImage] = useState<string | null>(null);
  const [mobileImage, setMobileImage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  const desktopFileRef = useRef<HTMLInputElement>(null);
  const mobileFileRef = useRef<HTMLInputElement>(null);

  const { data: visionStatus, isLoading: isCheckingVision } =
    trpc.sites.checkVisionConfigured.useQuery(
      { workspaceId },
      {
        enabled: isOpen && !!workspaceId,
      }
    );

  const importMutation = trpc.sites.importScreenshot.useMutation();

  if (!isOpen) return null;

  const isVisionConfigured = visionStatus?.configured ?? true;

  const handleDesktopFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setDesktopImage(event.target?.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleMobileFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setMobileImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desktopImage || !isVisionConfigured) return;

    setIsImporting(true);
    setError(null);
    setProgressMsg("Sending screenshot to vision-capable AI model...");

    try {
      const res = await importMutation.mutateAsync({
        workspaceId,
        desktopScreenshot: desktopImage,
        mobileScreenshot: mobileImage || undefined,
        siteName: siteName.trim() || undefined,
      });

      // Save report and reference screenshot for side-by-side view in editor
      try {
        sessionStorage.setItem("lastImportReport", JSON.stringify(res.report));
        sessionStorage.setItem("lastScreenshotRef", desktopImage);
      } catch {}

      setIsImporting(false);
      onClose();
      if (res?.site?.id) {
        router.push(`/editor/${res.site.id}`);
      }
    } catch (err: any) {
      setIsImporting(false);
      setError(
        err?.message ||
          "Failed to import screenshot. Please verify your vision AI provider configuration."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        data-testid="screenshot-import-modal"
        className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <h2 className="text-lg font-bold">Import from Screenshot</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>

        {/* Clear warning when no vision provider is configured */}
        {!isCheckingVision && !isVisionConfigured && (
          <div
            data-testid="no-vision-provider-warning"
            className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300"
          >
            <div className="font-semibold text-sm mb-1">Vision Provider Required</div>
            <p>
              No vision-capable AI provider is configured. Configure an AI provider with vision enabled
              (AI_PROVIDER_&lt;NAME&gt;_VISION=true or set AI_MODEL_CHAIN_VISION in .env).
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Website Name (Optional)
            </label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Redesigned Homepage"
              disabled={isImporting}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Desktop Screenshot (Required) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Desktop Screenshot <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={desktopFileRef}
              onChange={handleDesktopFileChange}
              accept="image/*"
              className="hidden"
            />
            {desktopImage ? (
              <div className="relative rounded-lg border border-neutral-300 dark:border-neutral-700 p-2 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800">
                <div className="flex items-center gap-3 overflow-hidden">
                  <img
                    src={desktopImage}
                    alt="Desktop preview"
                    className="h-14 w-20 rounded object-cover border border-neutral-200 dark:border-neutral-700"
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                    Desktop screenshot ready
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDesktopImage(null)}
                  disabled={isImporting}
                  className="text-xs text-red-500 hover:underline px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="upload-desktop-btn"
                onClick={() => desktopFileRef.current?.click()}
                disabled={isImporting}
                className="w-full rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center hover:border-neutral-400 dark:hover:border-neutral-600 transition"
              >
                <div className="text-2xl mb-1">🖥️</div>
                <div className="text-sm font-medium">Click to upload desktop screenshot</div>
                <div className="text-xs text-neutral-500 mt-1">PNG, JPG, or WebP up to 10MB</div>
              </button>
            )}
          </div>

          {/* Mobile Screenshot (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Mobile Screenshot (Optional)
            </label>
            <input
              type="file"
              ref={mobileFileRef}
              onChange={handleMobileFileChange}
              accept="image/*"
              className="hidden"
            />
            {mobileImage ? (
              <div className="relative rounded-lg border border-neutral-300 dark:border-neutral-700 p-2 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800">
                <div className="flex items-center gap-3 overflow-hidden">
                  <img
                    src={mobileImage}
                    alt="Mobile preview"
                    className="h-14 w-10 rounded object-cover border border-neutral-200 dark:border-neutral-700"
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                    Mobile screenshot attached
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileImage(null)}
                  disabled={isImporting}
                  className="text-xs text-red-500 hover:underline px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="upload-mobile-btn"
                onClick={() => mobileFileRef.current?.click()}
                disabled={isImporting}
                className="w-full rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-3 text-center hover:border-neutral-400 dark:hover:border-neutral-600 transition"
              >
                <div className="text-xs text-neutral-600 dark:text-neutral-400">
                  📱 Optional: Click to add mobile screenshot for responsive cues
                </div>
              </button>
            )}
          </div>

          {isImporting && (
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 text-xs text-blue-700 dark:text-blue-300">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span>{progressMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="submit-screenshot-import"
              disabled={!desktopImage || isImporting || !isVisionConfigured}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isImporting ? "Reconstructing Page..." : "Import Page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
