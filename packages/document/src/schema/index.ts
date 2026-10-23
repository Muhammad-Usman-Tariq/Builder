import { z } from "zod";

export const breakpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minWidth: z.number().nonnegative().optional(),
  maxWidth: z.number().nonnegative().optional(),
  isBase: z.boolean().optional(),
});

export const styleUnitSchema = z.enum(["px", "%", "rem", "em", "vw", "vh", "fr"]);

export const styleValueSchema = z.union([
  z.object({
    unit: styleUnitSchema,
    value: z.number(),
  }),
  z.object({
    keyword: z.string(),
  }),
  z.object({
    token: z.string(),
  }),
  z.object({
    raw: z.string(),
  }),
]);

export const cssDeclarationsSchema = z.record(z.string(), styleValueSchema);

export const styleStateSchema = z.enum(["default", "hover", "focus", "active"]);

export const styleRuleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["local", "class"]),
  name: z.string().optional(),
  values: z.record(
    z.string(), // breakpoint id
    z.object({
      default: cssDeclarationsSchema.optional(),
      hover: cssDeclarationsSchema.optional(),
      focus: cssDeclarationsSchema.optional(),
      active: cssDeclarationsSchema.optional(),
    })
  ),
});

export const propValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.any()),
    z.record(z.string(), z.any()),
    z.object({ asset: z.string().min(1) }),
    z.object({ token: z.string().min(1) }),
    z.object({
      bind: z.object({
        collection: z.string().min(1),
        field: z.string().min(1),
      }),
    }),
  ])
);

export const elementSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    name: z.string().optional(),
    parentId: z.string().nullable(),
    children: z.array(z.string()),
    props: z.record(z.string(), propValueSchema),
    styleIds: z.array(z.string()),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    instanceOf: z
      .object({
        componentId: z.string(),
        overrides: z.record(z.string(), z.any()),
      })
      .optional(),
    origin: z.enum(["user", "template", "ai", "figma", "url", "image"]).optional(),
    aiLocked: z.boolean().optional(),
  })
);

export const pageSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImageAssetId: z.string().optional(),
});

export const pageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  folderId: z.string().optional(),
  rootId: z.string().min(1),
  seo: pageSeoSchema,
  status: z.enum(["draft", "published"]),
  cmsTemplate: z.object({ collectionId: z.string() }).optional(),
});

export const componentDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootElementId: z.string().min(1),
  elements: z.record(z.string(), elementSchema),
  styleIds: z.array(z.string()),
  propDefs: z.record(z.string(), z.object({ type: z.string(), default: z.any().optional() })).optional(),
});

export const assetRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  key: z.string().min(1),
  url: z.string().min(1),
  type: z.string().min(1),
  size: z.number().nonnegative(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  blurhash: z.string().optional(),
});

export const designTokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
    mono: z.string().optional(),
  }),
  spacing: z.record(z.string(), z.union([z.number(), z.string()])),
  radius: z.record(z.string(), z.union([z.number(), z.string()])),
  shadows: z.record(z.string(), z.string()),
});

export const siteMetadataSchema = z.object({
  name: z.string().min(1),
  defaultLocale: z.string().min(1).default("en"),
  locales: z.array(z.string()).default(["en"]),
});

export const siteDocumentSchema = z.object({
  schemaVersion: z.number().int().positive(),
  site: siteMetadataSchema,
  breakpoints: z.array(breakpointSchema).min(1),
  tokens: designTokensSchema,
  pages: z.record(z.string(), pageSchema),
  elements: z.record(z.string(), elementSchema),
  styles: z.record(z.string(), styleRuleSchema),
  components: z.record(z.string(), componentDefSchema),
  assets: z.record(z.string(), assetRefSchema),
});

export const clipboardPayloadSchema = z.object({
  version: z.literal(1),
  type: z.literal("builder-element-clipboard"),
  rootElementId: z.string().min(1),
  elements: z.record(z.string(), elementSchema),
  styles: z.record(z.string(), styleRuleSchema),
});

export type ClipboardPayload = z.infer<typeof clipboardPayloadSchema>;

