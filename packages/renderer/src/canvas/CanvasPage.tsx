import type { ReactNode } from "react";
import type { SiteDocument } from "@builder/document";
import { CanvasElement } from "./CanvasElement.js";

export interface CanvasPageProps {
  doc: SiteDocument;
  pageId: string;
  isEditor?: boolean | undefined;
  selectedId?: string | null | undefined;
  onSelect?: ((elementId: string) => void) | undefined;
  resolveAssetUrl?: ((assetId: string) => string) | undefined;
  cmsEntry?: Record<string, any> | undefined;
  cmsEntries?: Record<string, any>[] | undefined;
}

export function CanvasPage({
  doc,
  pageId,
  isEditor = false,
  selectedId = null,
  onSelect,
  resolveAssetUrl,
  cmsEntry,
  cmsEntries,
}: CanvasPageProps): ReactNode {
  const page = doc.pages[pageId];
  if (!page) {
    return <div>Page not found: {pageId}</div>;
  }

  return (
    <CanvasElement
      doc={doc}
      elementId={page.rootId}
      isEditor={isEditor}
      selectedId={selectedId}
      onSelect={onSelect}
      resolveAssetUrl={resolveAssetUrl}
      cmsEntry={cmsEntry}
      cmsEntries={cmsEntries}
    />
  );
}
