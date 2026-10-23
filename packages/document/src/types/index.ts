export type ID = string;

export interface Breakpoint {
  id: string; // 'desktop' | 'tablet' | 'mobile'
  name: string;
  minWidth?: number | undefined;
  maxWidth?: number | undefined;
  isBase?: boolean | undefined;
}

export type StyleUnit = "px" | "%" | "rem" | "em" | "vw" | "vh" | "fr";

export type StyleValue =
  | { unit: StyleUnit; value: number }
  | { keyword: string }
  | { token: string }
  | { raw: string };

export type CSSDeclarations = Record<string, StyleValue>;

export type StyleState = "default" | "hover" | "focus" | "active";

export interface StyleRule {
  id: ID;
  kind: "local" | "class";
  name?: string | undefined;
  // Breakpoint ID ('desktop' | 'tablet' | 'mobile') -> State -> CSSDeclarations
  values: Record<string, Partial<Record<StyleState, CSSDeclarations>>>;
}

export type PropValue =
  | string
  | number
  | boolean
  | { asset: ID }
  | { token: string }
  | { bind: { collection: ID; field: string } };

export interface Element {
  id: ID;
  type: string;
  name?: string | undefined;
  parentId: ID | null;
  children: ID[];
  props: Record<string, PropValue>;
  styleIds: ID[];
  hidden?: boolean | undefined;
  locked?: boolean | undefined;
  instanceOf?:
    | {
        componentId: ID;
        overrides: Record<ID, Partial<Element>>;
      }
    | undefined;
  origin?: ("user" | "template" | "ai" | "figma" | "url" | "image") | undefined;
  aiLocked?: boolean | undefined;
}

export interface PageSeo {
  title?: string | undefined;
  description?: string | undefined;
  ogImageAssetId?: ID | undefined;
}

export interface Page {
  id: ID;
  name: string;
  slug: string;
  folderId?: ID | undefined;
  rootId: ID;
  seo: PageSeo;
  status: "draft" | "published";
  cmsTemplate?: { collectionId: ID } | undefined;
}

export interface ComponentDef {
  id: ID;
  name: string;
  rootElementId: ID;
  elements: Record<ID, Element>;
  styleIds: ID[];
  propDefs?: Record<string, { type: string; default?: unknown }> | undefined;
}

export interface AssetRef {
  id: ID;
  name: string;
  key: string;
  url: string;
  type: string;
  size: number;
  width?: number | undefined;
  height?: number | undefined;
  blurhash?: string | undefined;
}

export interface DesignTokens {
  colors: Record<string, string>;
  fonts: {
    heading: string;
    body: string;
    mono?: string | undefined;
  };
  spacing: Record<string, number | string>;
  radius: Record<string, number | string>;
  shadows: Record<string, string>;
}

export interface SiteMetadata {
  name: string;
  defaultLocale: string;
  locales: string[];
}

export interface SiteDocument {
  schemaVersion: number;
  site: SiteMetadata;
  breakpoints: Breakpoint[];
  tokens: DesignTokens;
  pages: Record<ID, Page>;
  elements: Record<ID, Element>;
  styles: Record<ID, StyleRule>;
  components: Record<ID, ComponentDef>;
  assets: Record<ID, AssetRef>;
}

export const KNOWN_ELEMENT_TYPES = [
  "Body",
  "Section",
  "Box",
  "Container",
  "Heading",
  "Text",
  "RichText",
  "Image",
  "Link",
  "Button",
  "Icon",
  "Navbar",
  "Form",
  "Input",
  "Textarea",
  "Submit",
  "CmsList",
  "CmsField",
] as const;

export type KnownElementType = (typeof KNOWN_ELEMENT_TYPES)[number];
