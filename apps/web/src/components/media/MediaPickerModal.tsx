"use client";

import React, { useState } from "react";
import { trpc } from "../../lib/trpc";

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string, altText?: string) => void;
  workspaceId: string;
}

export function MediaPickerModal({
  isOpen,
  onClose,
  onSelectImage,
  workspaceId,
}: MediaPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"library" | "unsplash">("library");
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: storageStatus } = trpc.assets.status.useQuery(
    { workspaceId },
    { enabled: isOpen && !!workspaceId }
  );
  const isConfigured = storageStatus?.configured ?? false;

  const { data: libraryAssets, isLoading: isLibraryLoading } = trpc.assets.list.useQuery(
    { workspaceId },
    { enabled: isOpen && !!workspaceId }
  );

  const { data: unsplashData, isLoading: isUnsplashLoading, refetch: refetchUnsplash } =
    trpc.assets.searchUnsplash.useQuery(
      { workspaceId, query: unsplashQuery || "nature" },
      { enabled: isOpen && !!workspaceId && activeTab === "unsplash" }
    );

  // Mutations
  const presignMutation = trpc.assets.presign.useMutation();
  const confirmMutation = trpc.assets.confirm.useMutation();

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isConfigured) {
      setUploadError("Storage is not configured — add S3_* to .env");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Get upload instructions (S3 PUT or Cloudinary POST)
      const presigned = await presignMutation.mutateAsync({
        workspaceId,
        filename: file.name,
        mimeType: file.type || "image/jpeg",
        size: file.size,
      });

      // 2. Direct browser upload to provider
      if (presigned.upload) {
        if (presigned.upload.method === "PUT") {
          const uploadRes = await fetch(presigned.upload.url, {
            method: "PUT",
            body: file,
            headers: presigned.upload.headers || {
              "Content-Type": file.type || "image/jpeg",
            },
          });
          if (!uploadRes.ok) {
            throw new Error(`Upload to storage failed (${uploadRes.status})`);
          }
        } else if (presigned.upload.method === "POST") {
          const formData = new FormData();
          if (presigned.upload.fields) {
            for (const [k, v] of Object.entries(presigned.upload.fields)) {
              formData.append(k, v);
            }
          }
          formData.append("file", file);
          const uploadRes = await fetch(presigned.upload.url, {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) {
            throw new Error(`Upload to storage failed (${uploadRes.status})`);
          }
        }
      } else if (presigned.uploadUrl) {
        const uploadRes = await fetch(presigned.uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "image/jpeg",
          },
        });
        if (!uploadRes.ok) {
          throw new Error(`Upload to storage failed (${uploadRes.status})`);
        }
      }

      // 3. Confirm upload with server
      if (presigned.asset?.id) {
        await confirmMutation.mutateAsync({
          workspaceId,
          assetId: presigned.asset.id,
        });
      }

      void utils.assets.list.invalidate();
      onSelectImage(presigned.publicUrl, file.name);
      onClose();
    } catch (err: any) {
      console.error("[MediaPicker] Upload failed:", err);
      setUploadError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSearchUnsplash = (e: React.FormEvent) => {
    e.preventDefault();
    if (unsplashQuery.trim()) {
      void refetchUnsplash();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex h-[580px] w-full max-w-3xl flex-col rounded-xl border border-neutral-800 bg-neutral-900 text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-neutral-800 px-6">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">Media Picker</span>
            <div className="flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
              <button
                onClick={() => setActiveTab("library")}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  activeTab === "library"
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Media Library
              </button>
              <button
                onClick={() => setActiveTab("unsplash")}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  activeTab === "unsplash"
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Unsplash Stock
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* LIBRARY TAB */}
          {activeTab === "library" && (
            <div className="flex flex-col gap-6">
              {!isConfigured && (
                <div className="rounded-xl border border-amber-900/60 bg-amber-950/40 p-4 text-xs text-amber-200">
                  <div className="font-semibold text-amber-300">Storage is not configured</div>
                  <div className="mt-0.5 text-amber-400/80">Add STORAGE_PROVIDER (s3 or cloudinary) to .env to enable direct image uploads.</div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 bg-neutral-950/60 p-8 text-center transition-colors ${!isConfigured ? "opacity-60 cursor-not-allowed" : "hover:border-neutral-700"}`}>
                <input
                  type="file"
                  id="media-file-input"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={handleFileUpload}
                  disabled={isUploading || !isConfigured}
                  className="hidden"
                />
                <label
                  htmlFor={isConfigured ? "media-file-input" : undefined}
                  className={`flex flex-col items-center ${isConfigured ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <div className="rounded-full bg-neutral-800 p-3 text-neutral-300">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="mt-3 font-medium text-sm text-neutral-200">
                    {isUploading ? "Uploading & processing image..." : "Upload an image"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    PNG, JPG, WebP, GIF or SVG up to 25MB
                  </div>
                </label>

                {uploadError && (
                  <div className="mt-2 text-xs text-red-400">{uploadError}</div>
                )}
              </div>

              {/* Uploaded Library Grid */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Uploaded Assets ({libraryAssets?.length || 0})
                </div>

                {isLibraryLoading ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    Loading assets...
                  </div>
                ) : !libraryAssets || libraryAssets.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    No images uploaded yet. Upload your first image above.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-4">
                    {libraryAssets.map((asset) => (
                      <div
                        key={asset.id}
                        onClick={() => {
                          onSelectImage(asset.publicUrl);
                          onClose();
                        }}
                        className="group relative cursor-pointer overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 aspect-video hover:border-blue-500 transition-colors"
                      >
                        <img
                          src={asset.publicUrl}
                          alt="Asset"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <span className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow">
                            Select
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UNSPLASH TAB */}
          {activeTab === "unsplash" && (
            <div className="flex flex-col gap-4">
              {/* Search Bar */}
              <form onSubmit={handleSearchUnsplash} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search stock photos (e.g. coffee, office, nature)..."
                  value={unsplashQuery}
                  onChange={(e) => setUnsplashQuery(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs text-white outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                >
                  Search
                </button>
              </form>

              {/* Status & Results */}
              {unsplashData?.configured === false ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 p-12 text-center">
                  <div className="font-medium text-neutral-300">
                    Unsplash API is optional and not currently configured
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 max-w-sm">
                    To enable stock photo search, add <code className="text-neutral-400">UNSPLASH_ACCESS_KEY</code> in your <code className="text-neutral-400">.env</code> file.
                  </div>
                </div>
              ) : isUnsplashLoading ? (
                <div className="py-12 text-center text-xs text-neutral-500">
                  Searching Unsplash...
                </div>
              ) : !unsplashData?.photos || unsplashData.photos.length === 0 ? (
                <div className="py-12 text-center text-xs text-neutral-500">
                  No stock photos found. Try a different query.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {unsplashData.photos.map((photo) => (
                    <div
                      key={photo.id}
                      onClick={() => {
                        onSelectImage(photo.url, photo.alt);
                        onClose();
                      }}
                      className="group relative cursor-pointer overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 aspect-video hover:border-blue-500 transition-colors"
                    >
                      <img
                        src={photo.thumb}
                        alt={photo.alt}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-[10px] text-neutral-300 truncate">
                        By {photo.author} on Unsplash
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow">
                          Use Image
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
