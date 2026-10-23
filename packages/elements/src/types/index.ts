import type { ReactNode, CSSProperties } from "react";
import type { z } from "zod";
import type { CSSDeclarations, Element, DesignTokens } from "@builder/document";

export interface ControlSpec {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "color" | "boolean" | "image" | "link";
  options?: { label: string; value: string }[] | undefined;
  defaultValue?: unknown;
}

export interface RenderContext {
  element: Element;
  children?: ReactNode | undefined;
  isEditor?: boolean | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  onSelect?: (() => void) | undefined;
  tokens?: DesignTokens | undefined;
  resolveAssetUrl?: ((assetId: string) => string) | undefined;
  cmsEntry?: Record<string, any> | undefined;
  cmsEntries?: Record<string, any>[] | undefined;
}

export interface ElementDefinition<P = Record<string, any>> {
  type: string;
  label: string;
  icon: string;
  category: "layout" | "content" | "form" | "interactive" | "special";
  propsSchema: z.ZodType<P, z.ZodTypeDef, any>;
  defaultProps: P;
  defaultStyle: CSSDeclarations;
  canHaveChildren: boolean;
  allowedChildren?: string[] | undefined;
  allowedParents?: string[] | undefined;
  controls: ControlSpec[];
  render: (props: P, ctx: RenderContext) => ReactNode;
  clientScript?: string | undefined;
  aiHint: string;
}
