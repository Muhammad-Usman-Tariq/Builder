import { nanoid } from "nanoid";
import type { Breakpoint, DesignTokens, SiteDocument } from "../types/index.js";

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: "desktop", name: "Desktop", minWidth: 1024, isBase: true },
  { id: "tablet", name: "Tablet", maxWidth: 1023, minWidth: 768 },
  { id: "mobile", name: "Mobile", maxWidth: 767 },
];

export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    "color.primary": "#0f172a",
    "color.primaryForeground": "#f8fafc",
    "color.secondary": "#f1f5f9",
    "color.secondaryForeground": "#0f172a",
    "color.accent": "#3b82f6",
    "color.accentForeground": "#ffffff",
    "color.background": "#ffffff",
    "color.surface": "#f8fafc",
    "color.text": "#0f172a",
    "color.textMuted": "#64748b",
    "color.border": "#e2e8f0",
  },
  fonts: {
    heading: "Inter, sans-serif",
    body: "Inter, sans-serif",
    mono: "monospace",
  },
  spacing: {
    "space.0": "0px",
    "space.1": "4px",
    "space.2": "8px",
    "space.3": "12px",
    "space.4": "16px",
    "space.6": "24px",
    "space.8": "32px",
    "space.12": "48px",
    "space.16": "64px",
    "space.24": "96px",
  },
  radius: {
    "radius.none": "0px",
    "radius.sm": "4px",
    "radius.md": "8px",
    "radius.lg": "16px",
    "radius.full": "9999px",
  },
  shadows: {
    "shadow.sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    "shadow.md": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    "shadow.lg": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  },
};

export function createBlankDocument(siteName = "My Site"): SiteDocument {
  const pageId = `page-${nanoid(8)}`;
  const bodyId = `el-body-${nanoid(8)}`;
  const bodyStyleId = `style-${nanoid(8)}`;

  return {
    schemaVersion: 3,
    site: {
      name: siteName,
      defaultLocale: "en",
      locales: ["en"],
    },
    breakpoints: DEFAULT_BREAKPOINTS,
    tokens: DEFAULT_TOKENS,
    pages: {
      [pageId]: {
        id: pageId,
        name: "Home",
        slug: "/",
        rootId: bodyId,
        seo: {
          title: siteName,
          description: `Welcome to ${siteName}`,
        },
        status: "draft",
      },
    },
    elements: {
      [bodyId]: {
        id: bodyId,
        type: "Body",
        name: "Body",
        parentId: null,
        children: [],
        props: {},
        styleIds: [bodyStyleId],
        origin: "user",
      },
    },
    styles: {
      [bodyStyleId]: {
        id: bodyStyleId,
        kind: "local",
        values: {
          desktop: {
            default: {
              minHeight: { unit: "vh", value: 100 },
              background: { token: "color.background" },
              color: { token: "color.text" },
              fontFamily: { token: "fonts.body" },
              padding: { unit: "px", value: 24 },
              gap: { unit: "px", value: 16 },
            },
          },
        },
      },
    },
    components: {},
    assets: {},
  };
}export const createBlankSiteDocument = createBlankDocument;
