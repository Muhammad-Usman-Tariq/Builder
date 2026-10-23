import { generateText, Output, asSchema, type LanguageModel } from "ai";
import { z } from "zod";
import {
  executeWithModelFallback,
  type AiTaskType,
  type ModelChainEntry,
  type LanguageModelResolver,
} from "../models/chain.js";

/**
 * Extracts and parses JSON from model text responses, handling optional
 * markdown ```json ... ``` blocks or raw object substring boundaries.
 */
export function extractJsonFromText(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Empty text response from model; expected JSON");
  }

  // 1. Check for markdown code fences (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // 2. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // 3. Fallback: extract substring between first '{' and last '}'
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }
    throw new Error("No valid JSON object found in model output");
  }
}

export interface GenerateStructuredOptions<T> {
  model: LanguageModel;
  entry: ModelChainEntry;
  schema: z.ZodType<T, any, any>;
  system: string;
  prompt: string;
  images?: Array<string | Uint8Array | Buffer | URL> | undefined;
  maxTokens?: number | undefined;
}

function buildMessagesOrPrompt(
  promptText: string,
  images?: Array<string | Uint8Array | Buffer | URL> | undefined
) {
  if (!images || images.length === 0) {
    return { prompt: promptText };
  }
  const content: Array<any> = [{ type: "text", text: promptText }];
  for (const img of images) {
    if (typeof img === "string" && img.startsWith("data:")) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        content.push({
          type: "file",
          data: match[2],
          mediaType: match[1],
        });
        continue;
      }
    }
    content.push({ type: "image", image: img });
  }
  return {
    messages: [
      {
        role: "user" as const,
        content,
      },
    ],
  };
}

/**
 * Executes structured generation using the provider's configured structured mode:
 * - "json_schema": native structured output via generateText with Output.object({ schema })
 * - "json_mode": JSON mode via generateText with Output.json(), validated with Zod
 * - "prompt": schema embedded in system prompt, generateText with Output.text(), response parsed and validated with Zod
 *
 * All modes validate with Zod. On validation failure, 1 repair attempt is made
 * before failing and allowing fallback to the next model in the chain.
 * Section B.2
 */
export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>
): Promise<T> {
  const { model, entry, schema, system, prompt, images, maxTokens } = options;
  const mode = entry.config?.structured || "json_schema";
  const mainInput = buildMessagesOrPrompt(prompt, images);

  if (mode === "json_schema") {
    try {
      const res = await generateText({
        model,
        output: Output.object({ schema }),
        system,
        ...(maxTokens ? { maxTokens } : {}),
        ...mainInput,
      } as any);
      return schema.parse(res.output);
    } catch (firstErr: unknown) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const repairPrompt = `${prompt}\n\nThe previous output was invalid JSON / did not match schema: ${errMsg}. Fix and return only valid JSON`;
      const repairInput = buildMessagesOrPrompt(repairPrompt, images);

      try {
        const repairRes = await generateText({
          model,
          output: Output.object({ schema }),
          system,
          ...(maxTokens ? { maxTokens } : {}),
          ...repairInput,
        } as any);
        return schema.parse(repairRes.output);
      } catch (repairErr: unknown) {
        const repMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
        throw new Error(
          `[json_schema mode failed after 1 repair attempt]: ${repMsg}`
        );
      }
    }
  }

  if (mode === "json_mode") {
    try {
      const res = await generateText({
        model,
        output: Output.json(),
        system,
        ...(maxTokens ? { maxTokens } : {}),
        ...mainInput,
      } as any);
      return schema.parse(res.output);
    } catch (firstErr: unknown) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const repairPrompt = `${prompt}\n\nThe previous output was invalid JSON / did not match schema: ${errMsg}. Fix and return only valid JSON`;
      const repairInput = buildMessagesOrPrompt(repairPrompt, images);

      try {
        const repairRes = await generateText({
          model,
          output: Output.json(),
          system,
          ...(maxTokens ? { maxTokens } : {}),
          ...repairInput,
        } as any);
        return schema.parse(repairRes.output);
      } catch (repairErr: unknown) {
        const repMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
        throw new Error(
          `[json_mode mode failed after 1 repair attempt]: ${repMsg}`
        );
      }
    }
  }

  // mode === "prompt"
  const schemaJson = JSON.stringify(asSchema(schema).jsonSchema, null, 2);
  const systemWithSchema = [
    system,
    "You must return a valid JSON object strictly conforming to the following JSON Schema:",
    schemaJson,
    "Respond ONLY with the JSON object. Do not include markdown codeblocks, explanations, or commentary.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await generateText({
      model,
      output: Output.text(),
      system: systemWithSchema,
      ...(maxTokens ? { maxTokens } : {}),
      ...mainInput,
    } as any);
    const parsed = extractJsonFromText(res.text);
    return schema.parse(parsed);
  } catch (firstErr: unknown) {
    const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    const repairPrompt = `${prompt}\n\nThe previous output was invalid JSON / did not match schema: ${errMsg}. Fix and return only valid JSON`;
    const repairInput = buildMessagesOrPrompt(repairPrompt, images);

    try {
      const repairRes = await generateText({
        model,
        output: Output.text(),
        system: systemWithSchema,
        ...(maxTokens ? { maxTokens } : {}),
        ...repairInput,
      } as any);
      const parsed = extractJsonFromText(repairRes.text);
      return schema.parse(parsed);
    } catch (repairErr: unknown) {
      const repMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(
        `[prompt mode failed after 1 repair attempt]: ${repMsg}`
      );
    }
  }
}

export interface GenerateStructuredWithFallbackOptions<T> {
  task: AiTaskType;
  schema: z.ZodType<T, any, any>;
  system: string;
  prompt: string;
  images?: Array<string | Uint8Array | Buffer | URL> | undefined;
  maxTokens?: number | undefined;
  customChain?: ModelChainEntry[] | undefined;
  modelResolver?: LanguageModelResolver | undefined;
  onThrottleWait?: ((message: string) => void) | undefined;
  onFallback?: ((failedModel: string, nextModel: string | undefined, error: string) => void) | undefined;
  onAttempt?: ((entry: ModelChainEntry, attemptIndex: number, total: number) => void) | undefined;
}

/**
 * Executes structured generation with chain fallback across all configured models.
 */
export async function generateStructuredWithFallback<T>(
  options: GenerateStructuredWithFallbackOptions<T>
): Promise<T> {
  return executeWithModelFallback(
    options.task,
    async (model, entry) => {
      return generateStructured({
        model,
        entry,
        schema: options.schema,
        system: options.system,
        prompt: options.prompt,
        images: options.images,
        maxTokens: options.maxTokens,
      });
    },
    {
      customChain: options.customChain,
      modelResolver: options.modelResolver,
      onThrottleWait: options.onThrottleWait,
      onFallback: options.onFallback,
      onAttempt: options.onAttempt,
    }
  );
}
