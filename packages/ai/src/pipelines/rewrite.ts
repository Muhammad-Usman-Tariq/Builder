import { generateText } from "ai";
import { executeWithModelFallback, type ModelChainEntry } from "../models/chain.js";

const REWRITE_SYSTEM_PROMPT = `
You are the copy editor for Builder, a visual website builder.
Rewrite the provided website text according to the user's requested tone or instructions.
Guidelines:
- Return ONLY the rewritten text without commentary, quotes, markdown formatting, or preamble.
- Keep the length and intent appropriate for its context (e.g. heading, button label, paragraph).
`;

/**
 * Rewrites website copy with AI based on user instructions.
 */
export async function rewriteText(
  text: string,
  instruction: string,
  customChain?: ModelChainEntry[]
): Promise<string> {
  return executeWithModelFallback(
    "text",
    async (model) => {
      const { text: result } = await generateText({
        model,
        system: REWRITE_SYSTEM_PROMPT,
        prompt: `
Original Text: "${text}"
Instruction: ${instruction}
Rewrite:
        `,
      });
      return result.trim();
    },
    { customChain }
  );
}
