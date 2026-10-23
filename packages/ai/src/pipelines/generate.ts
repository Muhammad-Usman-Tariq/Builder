import {
  AiSitePlanSchema,
  AiFlatSectionSchema,
  AiPageSectionsSchema,
  type AiSitePlan,
  type AiSection,
  type AiThemeTokens,
} from "../schema/ai-tree.js";
import { type ModelChainEntry } from "../models/chain.js";
import { generateStructuredWithFallback } from "./structured.js";
import { compileAiSiteDocument, rebuildTreeFromFlatNodes } from "../compiler/index.js";
import type { SiteDocument } from "@builder/document";

/**
 * Extracts a specific business name from the user's prompt if present.
 * Examples:
 * - "for Bloom & Petal" -> "Bloom & Petal"
 * - "called 'Bloom & Petal'" -> "Bloom & Petal"
 * - 'named "Bloom & Petal"' -> "Bloom & Petal"
 * - "Create a website for Bloom & Petal, an artisanal florist" -> "Bloom & Petal"
 */
export function extractBusinessNameFromPrompt(prompt: string): string | null {
  if (!prompt) return null;
  const trimmed = prompt.trim();

  // Pattern 1: Quotes e.g. "Bloom & Petal" or 'Bloom & Petal'
  const quotedMatch = trimmed.match(/["']([^"']{2,40})["']/);
  if (quotedMatch && quotedMatch[1]) {
    const candidate = quotedMatch[1].trim();
    if (!/^(website|landing page|home page|portfolio|store|site)$/i.test(candidate)) {
      return candidate;
    }
  }

  // Pattern 2: "for / called / named [Name], a / an / the"
  const namedMatch = trimmed.match(/\b(?:for|called|named)\s+([A-Z0-9][A-Za-z0-9&'.\s-]{1,35}?)(?:,\s*(?:an?|the)\b|\.\s*|\s+an?\b|\s+the\b|\s+is\b|\s+that\b|$)/i);
  if (namedMatch && namedMatch[1]) {
    const candidate = namedMatch[1].trim();
    if (candidate.length >= 2 && !/^(a|an|the|my|our|this|that)$/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

const PLAN_SYSTEM_PROMPT = `
You are the lead architect of Builder, an AI visual website builder.
Analyze the user's prompt and produce a comprehensive site plan:
1. Brief: businessName (the exact business name mentioned in the prompt, or a clean realistic business name), businessType, target audience, tone, 3 key business goals, and a primary brand color name.
2. Design Theme: modern color palette (primary, secondary, background, surface, text, muted, border, accent) in hex format, Google font pairing (heading and body font names), base spacing (8), and radius (8).
3. Pages: exactly 2 to 4 pages (Home "/" is mandatory, plus relevant pages like "/about", "/services", "/menu", "/contact").
For each page, list 3 to 5 sections with clean purpose descriptions and appropriate layouts (hero, features, gallery, cta, contact, etc.).
`;

const SECTION_SYSTEM_PROMPT = `
You are the visual design engine of Builder.
Generate a high-converting, beautiful section tree for the requested purpose and layout.
Output a FLAT array of nodes conforming to AiFlatSectionSchema using ONLY these primitives: Section, Box, Container, Heading, Text, RichText, Image, Link, Button, Icon, Navbar, Form, Input, Textarea, Submit.
Rules:
- Never write HTML or code.
- Return structured JSON with { name, purpose, nodes: [ { id, parentId, type, props, style } ] }.
- The root Section node must have id: "sec_root" and parentId: null.
- Every child node must have a valid parentId pointing to an existing node id.
- For Navbar, always set props.brandText to the exact business name provided in the prompt.
- For images, specify realistic, relevant Unsplash keyword queries in props.imageQuery and descriptive props.alt.
- For headings, specify level (1, 2, or 3) and compelling marketing copy in props.text.
- Use sensible responsive padding and background colors matching the theme in style.
`;

export interface GenerateSiteOptions {
  onProgress?: (stage: string, percent: number) => void | Promise<void>;
  onThrottleWait?: (message: string) => void | Promise<void>;
  onFallback?: (fromModel: string, toModel: string | undefined, reason: string) => void;
  onAttempt?: (entry: ModelChainEntry) => void;
}

/**
 * Step 1: Generates a brief, theme tokens, and multi-page plan from a user prompt.
 */
export async function generateSitePlan(
  prompt: string,
  customChain?: ModelChainEntry[],
  options?: {
    onThrottleWait?: (msg: string) => void | Promise<void>;
    onFallback?: (fromModel: string, toModel: string | undefined, reason: string) => void;
    onAttempt?: (entry: ModelChainEntry, attemptIndex: number, total: number) => void;
  }
): Promise<AiSitePlan> {
  const extractedName = extractBusinessNameFromPrompt(prompt);
  const promptInstruction = extractedName
    ? `Create a comprehensive site plan for: "${prompt}".
CRITICAL REQUIREMENT: The business name is "${extractedName}". In the brief, set brief.businessName to "${extractedName}". Use "${extractedName}" as the exact business name across all page titles and copy.`
    : `Create a comprehensive site plan for: "${prompt}"`;

  const plan = await generateStructuredWithFallback({
    task: "plan",
    schema: AiSitePlanSchema,
    system: PLAN_SYSTEM_PROMPT,
    prompt: promptInstruction,
    customChain,
    onThrottleWait: options?.onThrottleWait,
    onFallback: options?.onFallback,
    onAttempt: options?.onAttempt,
  });

  if (extractedName && !plan.brief.businessName) {
    plan.brief.businessName = extractedName;
  }

  return plan;
}

/**
 * Step 2: Generates a single section tree.
 */
export async function generateSection(
  briefSummary: string,
  theme: AiThemeTokens,
  sectionName: string,
  purpose: string,
  layout: string,
  customChain?: ModelChainEntry[],
  options?: {
    onThrottleWait?: (msg: string) => void | Promise<void>;
    onFallback?: (fromModel: string, toModel: string | undefined, reason: string) => void;
    onAttempt?: (entry: ModelChainEntry, attemptIndex: number, total: number) => void;
  }
): Promise<AiSection> {
  const flatSection = await generateStructuredWithFallback({
    task: "sections",
    schema: AiFlatSectionSchema,
    system: SECTION_SYSTEM_PROMPT,
    prompt: `
Brief: ${briefSummary}
Theme Colors: Primary ${theme.colors.primary}, Surface ${theme.colors.surface}, Background ${theme.colors.background}
Section Name: ${sectionName}
Purpose: ${purpose}
Layout: ${layout}
Generate a rich, complete section tree with polished copy, hierarchy, and appropriate buttons/images.
Return flat nodes where the root Section has parentId: null, and child elements specify their parent's id.
    `,
    customChain,
    onThrottleWait: options?.onThrottleWait,
    onFallback: options?.onFallback,
    onAttempt: options?.onAttempt,
  });

  const tree = rebuildTreeFromFlatNodes(flatSection.nodes);
  return {
    name: flatSection.name,
    purpose: flatSection.purpose,
    tree,
  };
}

const PAGE_SECTIONS_SYSTEM_PROMPT = `
You are the visual design engine of Builder.
Generate all sections for the requested page in a single response conforming to AiPageSectionsSchema.
Output a JSON object with a "sections" array. Each item must have:
- name: string
- purpose: string
- nodes: a FLAT array of nodes conforming to AiFlatSectionSchema using ONLY these primitives: Section, Box, Container, Heading, Text, RichText, Image, Link, Button, Icon, Navbar, Form, Input, Textarea, Submit.
Rules:
- Never write HTML or code.
- Within each section, the root Section node must have parentId: null.
- Every child node must have a valid parentId pointing to an existing node id within that same section.
- For images, specify realistic, relevant Unsplash keyword queries in props.imageQuery and descriptive props.alt.
- For headings, specify level (1, 2, or 3) and compelling marketing copy in props.text.
- Use sensible responsive padding and background colors matching the theme in style.
`;

/**
 * Generates all sections for a page in a single LLM request (page mode).
 */
export async function generatePageSections(
  briefSummary: string,
  theme: AiThemeTokens,
  pageName: string,
  pageSectionsPlan: Array<{ name: string; purpose: string; layout: string }>,
  customChain?: ModelChainEntry[],
  options?: {
    onThrottleWait?: (msg: string) => void | Promise<void>;
    onFallback?: (fromModel: string, toModel: string | undefined, reason: string) => void;
    onAttempt?: (entry: ModelChainEntry, attemptIndex: number, total: number) => void;
  }
): Promise<AiSection[]> {
  const sectionsPlanStr = pageSectionsPlan
    .map((s, idx) => `${idx + 1}. "${s.name}" (purpose: ${s.purpose}, layout: ${s.layout})`)
    .join("\n");

  const pageResult = await generateStructuredWithFallback({
    task: "sections",
    schema: AiPageSectionsSchema,
    system: PAGE_SECTIONS_SYSTEM_PROMPT,
    prompt: `
Brief: ${briefSummary}
Theme Colors: Primary ${theme.colors.primary}, Surface ${theme.colors.surface}, Background ${theme.colors.background}
Page Name: ${pageName}
Planned Sections to generate:
${sectionsPlanStr}

Generate complete, rich section trees for each planned section with polished copy, hierarchy, and appropriate buttons/images.
Return structured JSON where each section in "sections" contains flat nodes. In each section, the root Section has parentId: null and child elements specify their parent's id.
    `,
    customChain,
    onThrottleWait: options?.onThrottleWait,
    onFallback: options?.onFallback,
    onAttempt: options?.onAttempt,
  });

  return pageResult.sections.map((flatSection) => {
    const tree = rebuildTreeFromFlatNodes(flatSection.nodes);
    return {
      name: flatSection.name,
      purpose: flatSection.purpose,
      tree,
    };
  });
}

/**
 * End-to-end site generation pipeline from prompt to validated SiteDocument.
 */
export async function generateFullSite(
  prompt: string,
  onProgressOrOptions?:
    | ((stage: string, percent: number) => void)
    | GenerateSiteOptions
): Promise<SiteDocument> {
  const onProgress =
    typeof onProgressOrOptions === "function"
      ? onProgressOrOptions
      : onProgressOrOptions?.onProgress;
  const onThrottleWait =
    typeof onProgressOrOptions === "object"
      ? onProgressOrOptions?.onThrottleWait
      : undefined;
  const onFallback =
    typeof onProgressOrOptions === "object"
      ? onProgressOrOptions?.onFallback
      : undefined;
  const onAttempt =
    typeof onProgressOrOptions === "object"
      ? onProgressOrOptions?.onAttempt
      : undefined;

  await onProgress?.("Analyzing prompt & generating site plan...", 15);

  const tPlan = Date.now();
  let planModelUsed: ModelChainEntry | null = null;
  const plan = await generateSitePlan(prompt, undefined, {
    onThrottleWait: async (msg) => {
      await onThrottleWait?.(msg);
      await onProgress?.(msg, 12);
    },
    onFallback: (fromModel, toModel, reason) => {
      onFallback?.(fromModel, toModel, reason);
      console.warn(`[Worker] Planning fallback from ${fromModel} to ${toModel || "none"}: ${reason}`);
    },
    onAttempt: (entry) => {
      planModelUsed = entry;
      onAttempt?.(entry);
    },
  });
  const planDurationSec = ((Date.now() - tPlan) / 1000).toFixed(1);
  const planProvider = (planModelUsed as any)?.provider || "default";
  const planModel = (planModelUsed as any)?.modelId || "ai";
  console.log(`[Worker] Planning completed in ${planDurationSec}s (provider: ${planProvider}, model: ${planModel})`);

  const mode = (process.env["AI_GENERATION_MODE"] || "page").toLowerCase();
  const pageSections: Record<string, AiSection[]> = {};

  if (mode === "page") {
    // Page mode (default): 1 request per page returning all of that page's sections
    const effectiveBusinessName = plan.brief.businessName || plan.brief.businessType || "Generated Site";
    const totalPages = plan.pages.length;
    for (let i = 0; i < totalPages; i++) {
      const page = plan.pages[i]!;
      await onProgress?.(
        `Building ${page.name} (${i + 1}/${totalPages})...`,
        20 + Math.round((i / totalPages) * 65)
      );

      const tPage = Date.now();
      const sections = await generatePageSections(
        `Business Name: "${effectiveBusinessName}" | ${plan.brief.businessType} - ${plan.brief.tone}`,
        plan.theme,
        page.name,
        page.sections,
        undefined,
        {
          onThrottleWait: async (msg) => {
            await onThrottleWait?.(msg);
            await onProgress?.(msg, 20 + Math.round((i / totalPages) * 65));
          },
          onFallback: (fromModel, toModel, reason) => {
            onFallback?.(fromModel, toModel, reason);
            console.warn(`[Worker] Page "${page.name}" fallback from ${fromModel} to ${toModel || "none"}: ${reason}`);
          },
        }
      );
      const pageDurationSec = ((Date.now() - tPage) / 1000).toFixed(1);
      console.log(`[Worker] Page "${page.name}" generated in ${pageDurationSec}s`);

      pageSections[page.slug] = sections;
    }
  } else {
    // Section mode: 1 request per section (legacy behavior)
    const effectiveBusinessName = plan.brief.businessName || plan.brief.businessType || "Generated Site";
    const totalSections = plan.pages.reduce((acc, p) => acc + p.sections.length, 0);
    let completedSections = 0;

    for (const page of plan.pages) {
      pageSections[page.slug] = [];
      const tPage = Date.now();
      for (const secPlan of page.sections) {
        await onProgress?.(
          `Building ${page.name}: section "${secPlan.name}" (${completedSections + 1}/${totalSections})...`,
          20 + Math.round((completedSections / totalSections) * 60)
        );

        const section = await generateSection(
          `Business Name: "${effectiveBusinessName}" | ${plan.brief.businessType} - ${plan.brief.tone}`,
          plan.theme,
          secPlan.name,
          secPlan.purpose,
          secPlan.layout,
          undefined,
          {
            onThrottleWait: async (msg) => {
              await onThrottleWait?.(msg);
              await onProgress?.(msg, 20 + Math.round((completedSections / totalSections) * 60));
            },
          }
        );

        pageSections[page.slug]!.push(section);
        completedSections++;
      }
      const pageDurationSec = ((Date.now() - tPage) / 1000).toFixed(1);
      console.log(`[Worker] Page "${page.name}" generated in ${pageDurationSec}s`);
    }
  }

  const tCompile = Date.now();
  await onProgress?.("Compiling site document & applying theme tokens...", 90);
  const doc = compileAiSiteDocument({
    siteName: plan.brief.businessName || plan.brief.businessType || "Generated Site",
    plan,
    pageSections,
  });
  const compileDurationSec = ((Date.now() - tCompile) / 1000).toFixed(1);
  const warningCount = (doc as any).repairWarningsCount ?? 0;
  console.log(`[Worker] Compiled and repaired document in ${compileDurationSec}s (${warningCount} warnings)`);

  return doc;
}
