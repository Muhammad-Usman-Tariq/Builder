import { z } from "zod";

export const ListSitesInputSchema = z.object({});
export type ListSitesInput = z.infer<typeof ListSitesInputSchema>;

export const GetSiteStructureInputSchema = z.object({
  siteId: z.string().describe("ID of the site to inspect"),
  pageId: z.string().optional().describe("Optional page ID to filter hierarchy"),
});

export type GetSiteStructureInput = z.infer<typeof GetSiteStructureInputSchema>;

export const ListPagesInputSchema = z.object({
  siteId: z.string().describe("ID of the site"),
});

export type ListPagesInput = z.infer<typeof ListPagesInputSchema>;

export const UpdateTextInputSchema = z.object({
  siteId: z.string().describe("ID of the site"),
  elementId: z.string().describe("ID of the element whose text property will be updated"),
  text: z.string().describe("New text content"),
});

export type UpdateTextInput = z.infer<typeof UpdateTextInputSchema>;

export const SectionTypeSchema = z.enum([
  "hero",
  "features",
  "pricing",
  "cta",
  "testimonials",
  "faq",
  "contact",
]);

export type SectionType = z.infer<typeof SectionTypeSchema>;

export const CreateSectionInputSchema = z.object({
  siteId: z.string().describe("ID of the site"),
  pageId: z.string().describe("ID of the page to add the section to"),
  sectionType: SectionTypeSchema.describe("Type of section to create"),
  name: z.string().optional().describe("Optional custom label for the section"),
  confirmed: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to approve and execute section creation. If false, tool returns an approval request."),
  confirmationToken: z
    .string()
    .optional()
    .describe("Confirmation token returned by previous approval request"),
});

export type CreateSectionInput = z.infer<typeof CreateSectionInputSchema>;

export interface McpAuthContext {
  workspaceId: string;
  apiKeyId: string;
  keyName: string;
  permission: "read-only" | "read-write";
}
