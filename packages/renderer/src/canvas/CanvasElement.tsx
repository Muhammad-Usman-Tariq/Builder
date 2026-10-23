import type { ReactNode } from "react";
import type { Element, SiteDocument } from "@builder/document";
import { getElementDefinition } from "@builder/elements";

export interface CanvasElementProps {
  doc: SiteDocument;
  elementId: string;
  isEditor?: boolean | undefined;
  selectedId?: string | null | undefined;
  onSelect?: ((elementId: string) => void) | undefined;
  resolveAssetUrl?: ((assetId: string) => string) | undefined;
  cmsEntry?: Record<string, any> | undefined;
  cmsEntries?: Record<string, any>[] | undefined;
}

export function CanvasElement({
  doc,
  elementId,
  isEditor = false,
  selectedId = null,
  onSelect,
  resolveAssetUrl,
  cmsEntry,
  cmsEntries,
}: CanvasElementProps): ReactNode {
  const element: Element | undefined = doc.elements[elementId];
  if (!element) return null;

  const def = getElementDefinition(element.type);
  if (!def) {
    return (
      <div style={{ padding: "8px", border: "1px dashed red", color: "red" }}>
        Unknown element type: {element.type}
      </div>
    );
  }

  // Construct class names from linked styles
  const styleClasses = element.styleIds
    .map((id) => `s_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
    .join(" ");

  const editorClasses = isEditor && selectedId === element.id ? "is-selected" : "";
  const className = [styleClasses, editorClasses].filter(Boolean).join(" ");

  // Render children recursively
  const children = element.children.map((childId) => (
    <CanvasElement
      key={childId}
      doc={doc}
      elementId={childId}
      isEditor={isEditor}
      selectedId={selectedId}
      onSelect={onSelect}
      resolveAssetUrl={resolveAssetUrl}
      cmsEntry={cmsEntry}
      cmsEntries={cmsEntries}
    />
  ));

  return def.render(element.props, {
    element,
    children: children.length > 0 ? children : undefined,
    isEditor,
    className,
    tokens: doc.tokens,
    resolveAssetUrl,
    cmsEntry,
    cmsEntries,
    onSelect: () => onSelect?.(element.id),
  });
}
