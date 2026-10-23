import React, { createContext, useContext } from "react";
import { z } from "zod";
import type { ElementDefinition } from "../types/index.js";

/**
 * Context that supplies the active CMS entry to child CMS Fields.
 */
export const CmsEntryContext = createContext<Record<string, any> | null>(null);

export function useCmsEntry(): Record<string, any> | null {
  return useContext(CmsEntryContext);
}

/**
 * Sanitizes rich text HTML by removing dangerous script and event attributes.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .replace(/javascript:[^"']*/gi, "");
}

// ============================================================================
// 1. CMS List
// ============================================================================

export const cmsListPropsSchema = z.object({
  collectionId: z.string().default(""),
  collectionName: z.string().default(""),
  limit: z.number().int().min(1).max(100).default(6),
  sortBy: z.enum(["createdAt", "title", "date"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CmsListProps = z.infer<typeof cmsListPropsSchema>;

export const cmsListDefinition: ElementDefinition<CmsListProps> = {
  type: "CmsList",
  label: "CMS List",
  icon: "database",
  category: "special",
  propsSchema: cmsListPropsSchema,
  defaultProps: {
    collectionId: "",
    collectionName: "",
    limit: 6,
    sortBy: "createdAt",
    sortOrder: "desc",
  },
  defaultStyle: {
    display: { keyword: "grid" },
    width: { unit: "%", value: 100 },
    gap: { unit: "px", value: 24 },
  },
  canHaveChildren: true,
  controls: [
    {
      id: "collectionId",
      label: "Collection ID",
      type: "text",
    },
    {
      id: "limit",
      label: "Max Entries",
      type: "number",
      defaultValue: 6,
    },
    {
      id: "sortBy",
      label: "Sort By",
      type: "select",
      options: [
        { label: "Date Created", value: "createdAt" },
        { label: "Title", value: "title" },
      ],
      defaultValue: "createdAt",
    },
    {
      id: "sortOrder",
      label: "Order",
      type: "select",
      options: [
        { label: "Descending", value: "desc" },
        { label: "Ascending", value: "asc" },
      ],
      defaultValue: "desc",
    },
  ],
  render: (props, ctx) => {
    // If entries are provided via RenderContext
    const rawEntries = ctx.cmsEntries || [];
    let entries = [...rawEntries];

    // Filter by collection if specified
    if (props.collectionId && entries.length > 0) {
      entries = entries.filter(
        (e) => !e.collectionId || e.collectionId === props.collectionId
      );
    }

    // Sort entries
    entries.sort((a, b) => {
      let aVal = a[props.sortBy] || a.data?.[props.sortBy] || "";
      let bVal = b[props.sortBy] || b.data?.[props.sortBy] || "";
      if (props.sortOrder === "desc") {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      }
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    });

    // Limit entries
    if (props.limit && props.limit > 0) {
      entries = entries.slice(0, props.limit);
    }

    // If no entries present (e.g. initial canvas design), supply a default sample entry
    if (entries.length === 0) {
      entries = [
        {
          id: "preview_1",
          title: "Sample Blog Post Title",
          slug: "sample-blog-post",
          createdAt: new Date().toISOString(),
          data: {
            title: "Sample Blog Post Title",
            slug: "sample-blog-post",
            summary: "This is a preview of your repeating CMS card layout.",
            content: "<p>Sample blog post content for previewing in the visual editor.</p>",
            date: new Date().toISOString().split("T")[0],
            image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643",
          },
        },
      ];
    }

    return (
      <div
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="CmsList"
        data-collection-id={props.collectionId}
        className={ctx.className}
        style={ctx.style}
      >
        {entries.map((entry, idx) => (
          <CmsEntryContext.Provider key={entry.id || idx} value={entry}>
            <div className="cms-list-item flex flex-col h-full">
              {ctx.children}
            </div>
          </CmsEntryContext.Provider>
        ))}
      </div>
    );
  },
  aiHint: "Dynamic repeating container that renders its child layout for each published CMS entry of a chosen collection.",
};

// ============================================================================
// 2. CMS Field
// ============================================================================

export const cmsFieldPropsSchema = z.object({
  fieldKey: z.string().default("title"),
  fieldType: z.enum(["text", "rich_text", "image", "date", "slug"]).default("text"),
  tag: z.enum(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "div"]).optional(),
  fallback: z.string().default(""),
});

export type CmsFieldProps = z.infer<typeof cmsFieldPropsSchema>;

export const cmsFieldDefinition: ElementDefinition<CmsFieldProps> = {
  type: "CmsField",
  label: "CMS Field",
  icon: "tag",
  category: "content",
  propsSchema: cmsFieldPropsSchema,
  defaultProps: {
    fieldKey: "title",
    fieldType: "text",
    fallback: "",
  },
  defaultStyle: {
    display: { keyword: "inline-block" },
  },
  canHaveChildren: false,
  controls: [
    {
      id: "fieldKey",
      label: "Field Key",
      type: "text",
      defaultValue: "title",
    },
    {
      id: "fieldType",
      label: "Field Type",
      type: "select",
      options: [
        { label: "Text", value: "text" },
        { label: "Rich Text (HTML)", value: "rich_text" },
        { label: "Image", value: "image" },
        { label: "Date", value: "date" },
        { label: "Slug", value: "slug" },
      ],
      defaultValue: "text",
    },
    {
      id: "fallback",
      label: "Fallback Text",
      type: "text",
      defaultValue: "",
    },
  ],
  render: (props, ctx) => {
    // Read from Context hook or direct RenderContext entry
    const entryFromCtx = ctx.cmsEntry;
    // Helper to evaluate value inside React component
    return (
      <CmsFieldRenderer
        elementId={ctx.element.id}
        props={props}
        className={ctx.className}
        style={ctx.style}
        isEditor={ctx.isEditor}
        fallbackEntry={entryFromCtx}
        resolveAssetUrl={ctx.resolveAssetUrl}
      />
    );
  },
  aiHint: "Displays a specific field (title, rich text, date, image, slug) of the current CMS entry.",
};

function CmsFieldRenderer({
  elementId,
  props,
  className,
  style,
  isEditor,
  fallbackEntry,
  resolveAssetUrl,
}: {
  elementId: string;
  props: CmsFieldProps;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  isEditor?: boolean | undefined;
  fallbackEntry?: Record<string, any> | undefined;
  resolveAssetUrl?: ((assetId: string) => string) | undefined;
}) {
  const contextEntry = useContext(CmsEntryContext);
  const entry = contextEntry || fallbackEntry;

  const key = props.fieldKey || "title";
  let rawValue =
    entry?.[key] !== undefined
      ? entry[key]
      : entry?.data?.[key] !== undefined
      ? entry.data[key]
      : props.fallback;

  if (rawValue === undefined || rawValue === "") {
    if (isEditor) {
      rawValue = `{CMS: ${key}}`;
    } else {
      rawValue = props.fallback || "";
    }
  }

  if (props.fieldType === "image") {
    let src = typeof rawValue === "string" ? rawValue : "";
    if (src && resolveAssetUrl && !src.startsWith("http") && !src.startsWith("/")) {
      src = resolveAssetUrl(src);
    }
    return (
      <img
        id={elementId}
        data-element-id={elementId}
        data-element-type="CmsField"
        data-cms-field={key}
        src={src || "https://images.unsplash.com/photo-1499750310107-5fef28a66643"}
        alt={key}
        className={className}
        style={style}
      />
    );
  }

  if (props.fieldType === "rich_text") {
    const cleanHtml = sanitizeRichText(String(rawValue));
    return (
      <div
        id={elementId}
        data-element-id={elementId}
        data-element-type="CmsField"
        data-cms-field={key}
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    );
  }

  if (props.fieldType === "date") {
    let formatted = String(rawValue);
    try {
      const d = new Date(rawValue);
      if (!isNaN(d.getTime())) {
        formatted = d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
    } catch {}

    return (
      <time
        id={elementId}
        data-element-id={elementId}
        data-element-type="CmsField"
        data-cms-field={key}
        className={className}
        style={style}
      >
        {formatted}
      </time>
    );
  }

  const Tag = (props.tag || "span") as React.ElementType;
  return (
    <Tag
      id={elementId}
      data-element-id={elementId}
      data-element-type="CmsField"
      data-cms-field={key}
      className={className}
      style={style}
    >
      {String(rawValue)}
    </Tag>
  );
}
