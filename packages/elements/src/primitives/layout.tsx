import type { ElementType } from "react";
import { z } from "zod";
import type { ElementDefinition } from "../types/index.js";

import type { RenderContext } from "../types/index.js";

function shouldShowDropLabel(ctx: RenderContext): boolean {
  const origin = ctx.element.origin;
  // Must be created by the user
  if (origin && origin !== "user") {
    return false;
  }

  // Check if container has explicit size or background in ctx.style
  const s = ctx.style || {};
  if (s.width || s.height || s.minWidth || s.minHeight || s.maxWidth || s.maxHeight) {
    return false;
  }
  if (s.backgroundColor || s.background || s.backgroundImage) {
    return false;
  }

  return true;
}

function EmptyContainerPlaceholder({ ctx }: { ctx: RenderContext }) {
  if (!ctx.isEditor) return null;

  const showLabel = shouldShowDropLabel(ctx);

  if (showLabel) {
    return (
      <div
        data-placeholder="empty-container"
        style={{
          minHeight: "80px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px dashed #94a3b8",
          borderRadius: "6px",
          color: "#94a3b8",
          fontSize: "13px",
          fontFamily: "sans-serif",
          pointerEvents: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        Drop elements here
      </div>
    );
  }

  // For other empty boxes (imported from Figma, URL clone, screenshot, or styled containers),
  // do not show the label that overlaps the design. Show subtle dashed outline on hover/selection via CSS/style.
  return (
    <div
      data-placeholder="empty-subtle"
      style={{
        width: "100%",
        height: "100%",
        minHeight: "24px",
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

// 1. Body
export const bodyDefinition: ElementDefinition<Record<string, never>> = {
  type: "Body",
  label: "Page Body",
  icon: "layout",
  category: "layout",
  propsSchema: z.object({}),
  defaultProps: {},
  defaultStyle: {
    minHeight: { unit: "vh", value: 100 },
    display: { keyword: "flex" },
    flexDirection: { keyword: "column" },
    padding: { unit: "px", value: 24 },
    gap: { unit: "px", value: 16 },
  },
  canHaveChildren: true,
  allowedParents: [],
  controls: [],
  render: (_props, ctx) => {
    // In editor canvas, render as div; at publish on server, render as body or container
    const Tag = (ctx.isEditor ? "div" : "body") as ElementType;
    const content =
      ctx.isEditor && (!ctx.element.children || ctx.element.children.length === 0) ? (
        <EmptyContainerPlaceholder ctx={ctx} />
      ) : (
        ctx.children
      );
    return (
      <Tag
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Body"
        className={ctx.className}
        style={ctx.style}
      >
        {content}
      </Tag>
    );
  },
  aiHint: "Top-level root container representing the full HTML body.",
};

// 2. Section
export const sectionPropsSchema = z.object({
  tag: z.enum(["section", "header", "footer", "main", "aside"]).default("section"),
});
export type SectionProps = z.infer<typeof sectionPropsSchema>;

export const sectionDefinition: ElementDefinition<SectionProps> = {
  type: "Section",
  label: "Section",
  icon: "columns",
  category: "layout",
  propsSchema: sectionPropsSchema,
  defaultProps: { tag: "section" },
  defaultStyle: {
    display: { keyword: "flex" },
    flexDirection: { keyword: "column" },
    width: { unit: "%", value: 100 },
    padding: { unit: "px", value: 48 },
    gap: { unit: "px", value: 16 },
  },
  canHaveChildren: true,
  controls: [
    {
      id: "tag",
      label: "HTML Tag",
      type: "select",
      options: [
        { label: "section", value: "section" },
        { label: "header", value: "header" },
        { label: "footer", value: "footer" },
        { label: "main", value: "main" },
        { label: "aside", value: "aside" },
      ],
      defaultValue: "section",
    },
  ],
  render: (props, ctx) => {
    const Tag = (props.tag || "section") as ElementType;
    const content =
      ctx.isEditor && (!ctx.element.children || ctx.element.children.length === 0) ? (
        <EmptyContainerPlaceholder ctx={ctx} />
      ) : (
        ctx.children
      );
    return (
      <Tag
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Section"
        className={ctx.className}
        style={ctx.style}
      >
        {content}
      </Tag>
    );
  },
  aiHint: "Full-width structural section (e.g. Hero, Features, Testimonials, Footer).",
};

// 3. Box
export const boxPropsSchema = z.object({
  tag: z.enum(["div", "article", "aside"]).default("div"),
});
export type BoxProps = z.infer<typeof boxPropsSchema>;

export const boxDefinition: ElementDefinition<BoxProps> = {
  type: "Box",
  label: "Box",
  icon: "square",
  category: "layout",
  propsSchema: boxPropsSchema,
  defaultProps: { tag: "div" },
  defaultStyle: {
    display: { keyword: "flex" },
    flexDirection: { keyword: "column" },
    gap: { unit: "px", value: 12 },
  },
  canHaveChildren: true,
  controls: [
    {
      id: "tag",
      label: "HTML Tag",
      type: "select",
      options: [
        { label: "div", value: "div" },
        { label: "article", value: "article" },
        { label: "aside", value: "aside" },
      ],
      defaultValue: "div",
    },
  ],
  render: (props, ctx) => {
    const Tag = (props.tag || "div") as ElementType;
    const content =
      ctx.isEditor && (!ctx.element.children || ctx.element.children.length === 0) ? (
        <EmptyContainerPlaceholder ctx={ctx} />
      ) : (
        ctx.children
      );
    return (
      <Tag
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Box"
        className={ctx.className}
        style={ctx.style}
      >
        {content}
      </Tag>
    );
  },
  aiHint: "Flexible layout block or flexbox container for grouping elements.",
};

// 4. Container
export const containerPropsSchema = z.object({
  maxWidth: z.string().optional().default("1200px"),
});
export type ContainerProps = z.infer<typeof containerPropsSchema>;

export const containerDefinition: ElementDefinition<ContainerProps> = {
  type: "Container",
  label: "Container",
  icon: "maximize-2",
  category: "layout",
  propsSchema: containerPropsSchema,
  defaultProps: { maxWidth: "1200px" },
  defaultStyle: {
    width: { unit: "%", value: 100 },
    maxWidth: { unit: "px", value: 1200 },
    marginLeft: { keyword: "auto" },
    marginRight: { keyword: "auto" },
    display: { keyword: "flex" },
    flexDirection: { keyword: "column" },
    padding: { unit: "px", value: 24 },
    gap: { unit: "px", value: 16 },
  },
  canHaveChildren: true,
  controls: [
    {
      id: "maxWidth",
      label: "Max Width",
      type: "text",
      defaultValue: "1200px",
    },
  ],
  render: (_props, ctx) => {
    const content =
      ctx.isEditor && (!ctx.element.children || ctx.element.children.length === 0) ? (
        <EmptyContainerPlaceholder ctx={ctx} />
      ) : (
        ctx.children
      );
    return (
      <div
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Container"
        className={ctx.className}
        style={ctx.style}
      >
        {content}
      </div>
    );
  },
  aiHint: "Centered page width constraint container.",
};
