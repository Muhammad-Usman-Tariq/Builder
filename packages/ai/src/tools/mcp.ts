import { tool, jsonSchema } from "ai";

export interface RemoteToolDescriptor {
  name: string;
  description?: string | undefined;
  inputSchema?: Record<string, unknown> | undefined;
}

export type RemoteToolExecutor = (
  toolName: string,
  parameters: Record<string, unknown>
) => Promise<unknown>;

/**
 * Converts a list of external MCP tools into Vercel AI SDK tools
 * so that the AI copilot can invoke tools from connected external MCP servers.
 * Satisfies Architecture Section 13.3 & Milestone M10.
 */
export function convertMcpToolsToAiTools(
  tools: RemoteToolDescriptor[],
  executor: RemoteToolExecutor
): Record<string, unknown> {
  const aiTools: Record<string, unknown> = {};

  for (const t of tools) {
    const schemaObj = t.inputSchema || { type: "object", properties: {} };
    aiTools[t.name] = (tool as any)({
      description: t.description || `External MCP tool: ${t.name}`,
      parameters: jsonSchema(schemaObj as any),
      execute: async (args: any) => {
        return executor(t.name, (args as Record<string, unknown>) || {});
      },
    });
  }

  return aiTools;
}
