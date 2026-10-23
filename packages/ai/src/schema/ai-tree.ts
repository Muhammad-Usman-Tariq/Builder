import { z } from "zod";

/**
 * Primitives allowed in AI generation.
 * Section 10.1 of ARCHITECTURE.md
 */
export const AiPrimitiveTypeSchema = z.enum([
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
]);

export type AiPrimitiveType = z.infer<typeof AiPrimitiveTypeSchema>;

/**
 * Token-based or CSS style declarations for AI trees.
 */
export const AiStyleSchema = z.record(z.union([z.string(), z.number()])).optional();

/**
 * Base AI Node schema with recursive children.
 */
export type AiNode = {
  type: AiPrimitiveType;
  name?: string | undefined;
  style?: Record<string, string | number> | undefined;
  // Primitive-specific props
  level?: number | undefined;
  text?: string | undefined;
  href?: string | undefined;
  variant?: ("primary" | "secondary" | "outline" | "ghost") | undefined;
  src?: string | undefined;
  imageQuery?: string | undefined;
  alt?: string | undefined;
  nameProp?: string | undefined;
  placeholder?: string | undefined;
  inputType?: string | undefined;
  // Navbar specific
  brandText?: string | undefined;
  links?: Array<{ text: string; href: string }> | undefined;
  ctaText?: string | undefined;
  ctaHref?: string | undefined;
  // Children
  children?: AiNode[] | undefined;
};

export const AiNodeSchema: z.ZodType<AiNode> = z.lazy(() =>
  z.object({
    type: AiPrimitiveTypeSchema,
    name: z.string().optional(),
    style: AiStyleSchema,
    level: z.number().int().min(1).max(6).optional(),
    text: z.string().optional(),
    href: z.string().optional(),
    variant: z.enum(["primary", "secondary", "outline", "ghost"]).optional(),
    src: z.string().optional(),
    imageQuery: z.string().optional(),
    alt: z.string().optional(),
    nameProp: z.string().optional(),
    placeholder: z.string().optional(),
    inputType: z.string().optional(),
    brandText: z.string().optional(),
    links: z
      .array(
        z.object({
          text: z.string(),
          href: z.string(),
        })
      )
      .optional(),
    ctaText: z.string().optional(),
    ctaHref: z.string().optional(),
    children: z.array(AiNodeSchema).optional(),
  })
);

/**
 * Flat AI Node schema without recursive references to prevent SDK warnings and model validation failures.
 * Section B.1
 */
export const AiFlatNodePropsSchema = z
  .object({
    level: z.union([z.number(), z.string()]).optional(),
    text: z.string().optional(),
    href: z.string().optional(),
    variant: z.string().optional(),
    src: z.string().optional(),
    imageQuery: z
      .string()
      .optional()
      .describe("Relevant search query keywords for stock photography when type is Image (e.g. 'artisan coffee brewing')"),
    alt: z.string().optional(),
    name: z.string().optional(),
    nameProp: z.string().optional(),
    placeholder: z.string().optional(),
    inputType: z.string().optional(),
    brandText: z.string().optional(),
    links: z.array(z.object({ text: z.string(), href: z.string() })).optional(),
    ctaText: z.string().optional(),
    ctaHref: z.string().optional(),
  })
  .catchall(z.any())
  .optional()
  .default({});

export const AiFlatNodeSchema = z.object({
  id: z.string().describe("Unique identifier for this node (e.g. 'root', 'box_1', 'heading_1')"),
  parentId: z.string().nullable().optional().describe("ID of parent node, or null for the root Section node"),
  type: AiPrimitiveTypeSchema,
  name: z.string().optional(),
  props: AiFlatNodePropsSchema.describe("Primitive properties (imageQuery for Image nodes, text, level, href, src, alt, placeholder, etc.)"),
  style: AiStyleSchema.describe("Visual style tokens or CSS declarations"),
});

export type AiFlatNode = z.infer<typeof AiFlatNodeSchema>;

/**
 * Flat Section AI Tree Schema (one full section in flat node array format).
 */
export const AiFlatSectionSchema = z.object({
  name: z.string().default("Section"),
  purpose: z.string().optional(),
  nodes: z.array(AiFlatNodeSchema).min(1),
});

export type AiFlatSection = z.infer<typeof AiFlatSectionSchema>;

/**
 * Page Sections Schema for "page" mode generation (all sections for a single page in flat node format).
 */
export const AiPageSectionsSchema = z.object({
  sections: z.array(AiFlatSectionSchema).min(1),
});

export type AiPageSections = z.infer<typeof AiPageSectionsSchema>;

/**
 * Section AI Tree Schema (one full section with hierarchical tree).
 */
export const AiSectionSchema = z.object({
  name: z.string().default("Section"),
  purpose: z.string().optional(),
  tree: AiNodeSchema,
});

export type AiSection = z.infer<typeof AiSectionSchema>;

/**
 * Page Plan Schema.
 */
export const AiPagePlanSchema = z.object({
  name: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  sections: z.array(
    z.object({
      name: z.string(),
      purpose: z.string(),
      layout: z.enum(["hero", "features", "content", "gallery", "cta", "contact", "footer", "faq", "pricing"]),
    })
  ),
});

export type AiPagePlan = z.infer<typeof AiPagePlanSchema>;

/**
 * Theme & Design Tokens Plan Schema.
 */
export const AiThemeTokensSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    border: z.string(),
    accent: z.string(),
  }),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
  }),
  spacing: z.number().default(8),
  radius: z.number().default(8),
});

export type AiThemeTokens = z.infer<typeof AiThemeTokensSchema>;

/**
 * Full Site Plan Schema (Brief + Theme + Sitemap).
 */
export const AiSitePlanSchema = z.object({
  brief: z.object({
    businessName: z.string().optional().describe("Exact business name extracted from user prompt (e.g. 'Bloom & Petal')"),
    businessType: z.string(),
    audience: z.string(),
    tone: z.string(),
    goals: z.array(z.string()),
    primaryColorName: z.string(),
  }),
  theme: AiThemeTokensSchema,
  pages: z.array(AiPagePlanSchema).min(1),
});

export type AiSitePlan = z.infer<typeof AiSitePlanSchema>;
