import type { ElementType } from "react";
import { z } from "zod";
import type { ElementDefinition } from "../types/index.js";

// 5. Heading
export const headingPropsSchema = z.object({
  text: z.string().default("Heading"),
  level: z.preprocess((val) => {
    if (typeof val === "string") {
      const match = val.match(/\d/);
      return match ? parseInt(match[0], 10) : 2;
    }
    return typeof val === "number" ? val : 2;
  }, z.number().int().min(1).max(6).default(2)),
});
export type HeadingProps = z.infer<typeof headingPropsSchema>;

export const headingDefinition: ElementDefinition<HeadingProps> = {
  type: "Heading",
  label: "Heading",
  icon: "type",
  category: "content",
  propsSchema: headingPropsSchema,
  defaultProps: { text: "Heading", level: 2 },
  defaultStyle: {
    fontFamily: { token: "fonts.heading" },
    fontWeight: { keyword: "700" },
    lineHeight: { keyword: "1.2" },
    color: { token: "color.text" },
  },
  canHaveChildren: false,
  controls: [
    { id: "text", label: "Text", type: "text", defaultValue: "Heading" },
    {
      id: "level",
      label: "Heading Level",
      type: "select",
      options: [
        { label: "H1", value: "1" },
        { label: "H2", value: "2" },
        { label: "H3", value: "3" },
        { label: "H4", value: "4" },
        { label: "H5", value: "5" },
        { label: "H6", value: "6" },
      ],
      defaultValue: "2",
    },
  ],
  render: (props, ctx) => {
    const rawLevel =
      typeof props.level === "string"
        ? parseInt(String(props.level).replace(/\D/g, ""), 10)
        : Number(props.level);
    const safeLevel = Math.min(Math.max(rawLevel || 2, 1), 6);
    const Tag = `h${safeLevel}` as ElementType;
    return (
      <Tag
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Heading"
        className={ctx.className}
        style={ctx.style}
      >
        {props.text}
      </Tag>
    );
  },
  aiHint: "Headlines and section titles with level 1 through 6.",
};

// 6. Text
export const textSpanSchema = z.object({
  text: z.string(),
  style: z.record(z.string(), z.any()).optional(),
});

export const textPropsSchema = z.object({
  text: z.string().default("Paragraph text goes here."),
  tag: z.enum(["p", "span"]).default("p"),
  spans: z.array(textSpanSchema).optional(),
});
export type TextProps = z.infer<typeof textPropsSchema>;

export const textDefinition: ElementDefinition<TextProps> = {
  type: "Text",
  label: "Text",
  icon: "align-left",
  category: "content",
  propsSchema: textPropsSchema,
  defaultProps: { text: "Paragraph text goes here.", tag: "p" },
  defaultStyle: {
    fontFamily: { token: "fonts.body" },
    fontSize: { unit: "px", value: 16 },
    lineHeight: { keyword: "1.6" },
    color: { token: "color.text" },
  },
  canHaveChildren: false,
  controls: [
    { id: "text", label: "Content", type: "text", defaultValue: "Paragraph text goes here." },
    {
      id: "tag",
      label: "HTML Tag",
      type: "select",
      options: [
        { label: "Paragraph (p)", value: "p" },
        { label: "Inline (span)", value: "span" },
      ],
      defaultValue: "p",
    },
  ],
  render: (props, ctx) => {
    const Tag = (props.tag || "p") as ElementType;

    if (props.spans && props.spans.length > 0) {
      return (
        <Tag
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Text"
          className={ctx.className}
          style={ctx.style}
        >
          {props.spans.map((span, i) => (
            <span key={i} style={span.style as any}>
              {span.text}
            </span>
          ))}
        </Tag>
      );
    }

    return (
      <Tag
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Text"
        className={ctx.className}
        style={ctx.style}
      >
        {props.text}
      </Tag>
    );
  },
  aiHint: "Body text or inline textual content.",
};

// 7. RichText
export const richTextPropsSchema = z.object({
  html: z.string().default("<p>Rich text content...</p>"),
});
export type RichTextProps = z.infer<typeof richTextPropsSchema>;

export const richTextDefinition: ElementDefinition<RichTextProps> = {
  type: "RichText",
  label: "Rich Text",
  icon: "file-text",
  category: "content",
  propsSchema: richTextPropsSchema,
  defaultProps: { html: "<p>Rich text content...</p>" },
  defaultStyle: {
    lineHeight: { keyword: "1.6" },
  },
  canHaveChildren: false,
  controls: [{ id: "html", label: "HTML Content", type: "text" }],
  render: (props, ctx) => {
    return (
      <div
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="RichText"
        className={ctx.className}
        style={ctx.style}
        dangerouslySetInnerHTML={{ __html: props.html || "" }}
      />
    );
  },
  aiHint: "Multi-paragraph rich HTML formatted content.",
};

// 8. Image
export const imagePropsSchema = z.object({
  src: z.string().default(""),
  alt: z.string().default("Image description"),
  width: z.number().optional(),
  height: z.number().optional(),
  loading: z.enum(["lazy", "eager"]).default("lazy"),
  imageQuery: z.string().optional(),
  unsplashAuthor: z.string().optional(),
  unsplashAuthorUrl: z.string().optional(),
  unsplashPhotoId: z.string().optional(),
  unsplashAttribution: z.string().optional(),
});
export type ImageProps = z.infer<typeof imagePropsSchema>;

export const imageDefinition: ElementDefinition<ImageProps> = {
  type: "Image",
  label: "Image",
  icon: "image",
  category: "content",
  propsSchema: imagePropsSchema,
  defaultProps: {
    src: "",
    alt: "Image description",
    loading: "lazy",
  },
  defaultStyle: {
    maxWidth: { unit: "%", value: 100 },
    height: { keyword: "auto" },
    display: { keyword: "block" },
  },
  canHaveChildren: false,
  controls: [
    { id: "src", label: "Image Source / URL", type: "image" },
    { id: "alt", label: "Alt Text", type: "text" },
  ],
  render: (props, ctx) => {
    let resolvedSrc = props.src;
    const assetProp = ctx.element.props["asset"];
    if (assetProp && typeof assetProp === "object" && "asset" in assetProp && ctx.resolveAssetUrl) {
      resolvedSrc = ctx.resolveAssetUrl(assetProp.asset);
    }

    if (!resolvedSrc) {
      if (!ctx.isEditor) {
        return null;
      }
      return (
        <div
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Image"
          className={ctx.className}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "140px",
            width: "100%",
            backgroundColor: "#262626",
            border: "2px dashed #525252",
            borderRadius: "6px",
            color: "#a3a3a3",
            padding: "16px",
            cursor: "pointer",
            userSelect: "none",
            ...ctx.style,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <span style={{ fontSize: "12px", marginTop: "8px", fontWeight: 500 }}>
            Choose image
          </span>
          <span style={{ fontSize: "10px", color: "#737373", marginTop: "2px" }}>
            Click to upload or select from media library
          </span>
        </div>
      );
    }

    return (
      <img
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Image"
        src={resolvedSrc}
        alt={props.alt || ""}
        width={props.width}
        height={props.height}
        loading={props.loading}
        className={ctx.className}
        style={ctx.style}
      />
    );
  },
  aiHint: "Visual images, photographs, or graphics.",
};

// 9. Link
export const linkPropsSchema = z.object({
  href: z.string().default("#"),
  target: z.enum(["_self", "_blank"]).default("_self"),
  text: z.string().optional(),
});
export type LinkProps = z.infer<typeof linkPropsSchema>;

export const linkDefinition: ElementDefinition<LinkProps> = {
  type: "Link",
  label: "Link",
  icon: "link",
  category: "content",
  propsSchema: linkPropsSchema,
  defaultProps: { href: "#", target: "_self" },
  defaultStyle: {
    color: { token: "color.accent" },
    textDecoration: { keyword: "underline" },
  },
  canHaveChildren: true,
  controls: [
    { id: "href", label: "URL Destination", type: "link" },
    {
      id: "target",
      label: "Open in",
      type: "select",
      options: [
        { label: "Same Tab (_self)", value: "_self" },
        { label: "New Tab (_blank)", value: "_blank" },
      ],
      defaultValue: "_self",
    },
  ],
  render: (props, ctx) => {
    return (
      <a
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Link"
        href={props.href || "#"}
        target={props.target}
        rel={props.target === "_blank" ? "noopener noreferrer" : undefined}
        className={ctx.className}
        style={ctx.style}
      >
        {ctx.children ?? props.text}
      </a>
    );
  },
  aiHint: "Hyperlink for navigation.",
};

// 10. Button
export const buttonPropsSchema = z.object({
  text: z.string().default("Click Me"),
  href: z.string().optional(),
  variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
});
export type ButtonProps = z.infer<typeof buttonPropsSchema>;

export const buttonDefinition: ElementDefinition<ButtonProps> = {
  type: "Button",
  label: "Button",
  icon: "mouse-pointer",
  category: "content",
  propsSchema: buttonPropsSchema,
  defaultProps: { text: "Click Me", variant: "primary" },
  defaultStyle: {
    display: { keyword: "inline-flex" },
    alignItems: { keyword: "center" },
    justifyContent: { keyword: "center" },
    padding: { unit: "px", value: 12 },
    borderRadius: { token: "radius.md" },
    fontWeight: { keyword: "600" },
    cursor: { keyword: "pointer" },
    background: { token: "color.primary" },
    color: { token: "color.primaryForeground" },
    textDecoration: { keyword: "none" },
  },
  canHaveChildren: false,
  controls: [
    { id: "text", label: "Button Label", type: "text", defaultValue: "Click Me" },
    { id: "href", label: "Link URL (optional)", type: "link" },
    {
      id: "variant",
      label: "Variant",
      type: "select",
      options: [
        { label: "Primary", value: "primary" },
        { label: "Secondary", value: "secondary" },
        { label: "Outline", value: "outline" },
      ],
      defaultValue: "primary",
    },
  ],
  render: (props, ctx) => {
    if (props.href) {
      return (
        <a
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Button"
          href={props.href}
          className={ctx.className}
          style={ctx.style}
        >
          {props.text}
        </a>
      );
    }

    return (
      <button
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Button"
        type="button"
        className={ctx.className}
        style={ctx.style}
      >
        {props.text}
      </button>
    );
  },
  aiHint: "Call to action button or interactive trigger.",
};

// 11. Icon
export const iconPropsSchema = z.object({
  name: z.string().default("star"),
  size: z.number().default(24),
  src: z.string().optional(),
});
export type IconProps = z.infer<typeof iconPropsSchema>;

export const iconDefinition: ElementDefinition<IconProps> = {
  type: "Icon",
  label: "Icon",
  icon: "feather",
  category: "content",
  propsSchema: iconPropsSchema,
  defaultProps: { name: "star", size: 24 },
  defaultStyle: {
    display: { keyword: "inline-block" },
    color: { keyword: "currentColor" },
  },
  canHaveChildren: false,
  controls: [
    { id: "name", label: "Icon Name", type: "text", defaultValue: "star" },
    { id: "size", label: "Size (px)", type: "number", defaultValue: 24 },
    { id: "src", label: "Icon SVG URL", type: "text" },
  ],
  render: (props, ctx) => {
    let resolvedSrc = props.src;
    const assetProp = ctx.element.props["asset"];
    if (assetProp && typeof assetProp === "object" && "asset" in assetProp && ctx.resolveAssetUrl) {
      resolvedSrc = ctx.resolveAssetUrl(assetProp.asset);
    }

    if (resolvedSrc) {
      return (
        <span
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Icon"
          data-icon-name={props.name}
          className={ctx.className}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: props.size,
            height: props.size,
            ...ctx.style,
          }}
        >
          <img
            src={resolvedSrc}
            alt={props.name || "Icon"}
            width={props.size}
            height={props.size}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </span>
      );
    }

    return (
      <span
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Icon"
        data-icon-name={props.name}
        className={ctx.className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: props.size,
          height: props.size,
          ...ctx.style,
        }}
      >
        <svg
          width={props.size}
          height={props.size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      </span>
    );
  },
  aiHint: "Symbolic iconography for features, badges, or buttons.",
};
