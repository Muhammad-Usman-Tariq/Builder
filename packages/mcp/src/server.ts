import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  GetSiteStructureInputSchema,
  ListPagesInputSchema,
  UpdateTextInputSchema,
  CreateSectionInputSchema,
} from "./types.js";
import {
  handleListSites,
  handleGetSiteStructure,
  handleListPages,
  handleUpdateText,
  handleCreateSection,
} from "./tools/index.js";
import { authenticateMcpToken } from "./auth.js";
import { recordMcpAudit } from "./audit.js";

/**
 * Web Standards Streamable HTTP Server handler for /api/mcp using official MCP SDK.
 * Implements token authentication, audit logging, and tool dispatch via McpServer.
 */
export async function handleMcpHttpRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!authHeader) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized: Missing Authorization header" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let auth;
  try {
    auth = await authenticateMcpToken(authHeader);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized: " + (err?.message || "Invalid or expired API key") },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Ensure Accept header satisfies MCP streamable HTTP specification
  const headers = new Headers(req.headers);
  const accept = headers.get("accept") || "";
  if (!accept.includes("text/event-stream") || !accept.includes("application/json")) {
    headers.set("accept", "application/json, text/event-stream");
  }

  let parsedBody: unknown = undefined;
  if (req.method === "POST") {
    try {
      const cloned = req.clone();
      parsedBody = await cloned.json();
    } catch {
      // Body may not be JSON
    }
  }

  const actor = auth.keyName || auth.apiKeyId || "mcp_client";
  const server = createBuilderMcpServer(auth.workspaceId, actor, auth.permission);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const normalizedReq = new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    // @ts-expect-error duplex is required in Node environments when body is streaming
    duplex: "half",
  });

  return transport.handleRequest(normalizedReq, { parsedBody });
}

/**
 * Creates and configures an MCP server instance bound to a workspace.
 */
export function createBuilderMcpServer(
  workspaceId: string,
  actor: string,
  permission: "read-only" | "read-write" = "read-write"
): McpServer {
  const server = new McpServer({
    name: "builder-mcp",
    version: "1.0.0",
  });

  // Tool 0: list_sites
  server.tool(
    "list_sites",
    "Lists all websites in the workspace with their IDs, names, last updated timestamps, and page counts",
    {},
    async () => {
      try {
        const result = await handleListSites(workspaceId, actor);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err?.message || "Failed to list sites" }],
        };
      }
    }
  );

  // Tool 1: get_site_structure
  server.tool(
    "get_site_structure",
    "Inspects the layout, pages, and element hierarchy of a website document",
    {
      siteId: z.string().describe("ID of the site to inspect"),
      pageId: z.string().optional().describe("Optional page ID to filter hierarchy"),
    },
    async (args) => {
      try {
        const result = await handleGetSiteStructure(workspaceId, actor, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err?.message || "Failed to get site structure" }],
        };
      }
    }
  );

  // Tool 2: list_pages
  server.tool(
    "list_pages",
    "Lists all pages defined in a website document along with their routes",
    {
      siteId: z.string().describe("ID of the site"),
    },
    async (args) => {
      try {
        const result = await handleListPages(workspaceId, actor, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err?.message || "Failed to list pages" }],
        };
      }
    }
  );

  // Tool 3: update_text
  server.tool(
    "update_text",
    "Updates the text content of any text-supporting element in a site document",
    {
      siteId: z.string().describe("ID of the site"),
      elementId: z.string().describe("ID of the element whose text property will be updated"),
      text: z.string().describe("New text content"),
    },
    async (args) => {
      if (permission === "read-only") {
        await recordMcpAudit({
          workspaceId,
          actor,
          action: "mcp:update_text:denied",
          target: args.siteId,
          data: { reason: "read-only token", elementId: args.elementId },
        });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Permission denied: token has read-only access and cannot perform write operations.",
            },
          ],
        };
      }
      try {
        const result = await handleUpdateText(workspaceId, actor, args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err?.message || "Failed to update text" }],
        };
      }
    }
  );

  // Tool 4: create_section
  server.tool(
    "create_section",
    "Adds a pre-designed layout section to a page. Requires explicit confirmation (confirmed: true) before applying changes.",
    {
      siteId: z.string().describe("ID of the site"),
      pageId: z.string().describe("ID of the page to add the section to"),
      sectionType: z
        .enum(["hero", "features", "pricing", "cta", "testimonials", "faq", "contact"])
        .describe("Type of section to create"),
      name: z.string().optional().describe("Optional custom label for the section"),
      confirmed: z
        .boolean()
        .optional()
        .describe("Set to true to approve section creation. If false, tool returns an approval request."),
      confirmationToken: z
        .string()
        .optional()
        .describe("Confirmation token returned by prior approval request"),
    },
    async (args) => {
      if (permission === "read-only") {
        await recordMcpAudit({
          workspaceId,
          actor,
          action: "mcp:create_section:denied",
          target: args.siteId,
          data: { reason: "read-only token", sectionType: args.sectionType },
        });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Permission denied: token has read-only access and cannot perform write operations.",
            },
          ],
        };
      }
      try {
        const result = await handleCreateSection(workspaceId, actor, {
          ...args,
          confirmed: args.confirmed ?? false,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: err?.message || "Failed to create section" }],
        };
      }
    }
  );

  return server;
}

export interface McpRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface McpRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Direct JSON-RPC HTTP dispatcher for the /mcp endpoint.
 */
export async function handleMcpRpc(
  authHeader: string | null,
  body: McpRpcRequest
): Promise<McpRpcResponse> {
  const reqId = body.id ?? null;

  if (!authHeader) {
    return {
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32001, message: "Unauthorized: Missing Authorization header" },
    };
  }

  let authContext;
  try {
    authContext = await authenticateMcpToken(authHeader);
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id: reqId,
      error: { code: -32001, message: err?.message || "Authentication failed" },
    };
  }

  const { workspaceId, apiKeyId } = authContext;
  const actor = `mcp:${apiKeyId}`;

  switch (body.method) {
    case "initialize": {
      return {
        jsonrpc: "2.0",
        id: reqId,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "builder-mcp",
            version: "1.0.0",
          },
        },
      };
    }

    case "tools/list": {
      return {
        jsonrpc: "2.0",
        id: reqId,
        result: {
          tools: [
            {
              name: "list_sites",
              description: "Lists all websites in the workspace with their IDs, names, last updated timestamps, and page counts",
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
            {
              name: "get_site_structure",
              description: "Inspects the layout, pages, and element hierarchy of a website document",
              inputSchema: {
                type: "object",
                properties: {
                  siteId: { type: "string", description: "ID of the site to inspect" },
                  pageId: { type: "string", description: "Optional page ID to filter hierarchy" },
                },
                required: ["siteId"],
              },
            },
            {
              name: "list_pages",
              description: "Lists all pages defined in a website document along with their routes",
              inputSchema: {
                type: "object",
                properties: {
                  siteId: { type: "string", description: "ID of the site" },
                },
                required: ["siteId"],
              },
            },
            {
              name: "update_text",
              description: "Updates the text content of any text-supporting element in a site document",
              inputSchema: {
                type: "object",
                properties: {
                  siteId: { type: "string", description: "ID of the site" },
                  elementId: { type: "string", description: "ID of the element" },
                  text: { type: "string", description: "New text content" },
                },
                required: ["siteId", "elementId", "text"],
              },
            },
            {
              name: "create_section",
              description:
                "Adds a pre-designed layout section to a page. Requires explicit confirmation (confirmed: true) before applying changes.",
              inputSchema: {
                type: "object",
                properties: {
                  siteId: { type: "string", description: "ID of the site" },
                  pageId: { type: "string", description: "ID of the page" },
                  sectionType: {
                    type: "string",
                    enum: ["hero", "features", "pricing", "cta", "testimonials", "faq", "contact"],
                  },
                  name: { type: "string" },
                  confirmed: { type: "boolean" },
                  confirmationToken: { type: "string" },
                },
                required: ["siteId", "pageId", "sectionType"],
              },
            },
          ],
        },
      };
    }

    case "tools/call": {
      const toolName = body.params?.name;
      const args = body.params?.arguments || {};

      if (authContext.permission === "read-only" && (toolName === "update_text" || toolName === "create_section")) {
        await recordMcpAudit({
          workspaceId,
          actor,
          action: `mcp:${toolName}:denied`,
          target: (args as any)?.siteId || "unknown",
          data: { reason: "read-only token", tool: toolName },
        });
        return {
          jsonrpc: "2.0",
          id: reqId,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: "Permission denied: token has read-only access and cannot perform write operations.",
              },
            ],
          },
        };
      }

      try {
        let toolOutput: any;

        switch (toolName) {
          case "list_sites": {
            toolOutput = await handleListSites(workspaceId, actor);
            break;
          }
          case "get_site_structure": {
            const parsed = GetSiteStructureInputSchema.parse(args);
            toolOutput = await handleGetSiteStructure(workspaceId, actor, parsed);
            break;
          }
          case "list_pages": {
            const parsed = ListPagesInputSchema.parse(args);
            toolOutput = await handleListPages(workspaceId, actor, parsed);
            break;
          }
          case "update_text": {
            const parsed = UpdateTextInputSchema.parse(args);
            toolOutput = await handleUpdateText(workspaceId, actor, parsed);
            break;
          }
          case "create_section": {
            const parsed = CreateSectionInputSchema.parse(args);
            toolOutput = await handleCreateSection(workspaceId, actor, parsed);
            break;
          }
          default:
            return {
              jsonrpc: "2.0",
              id: reqId,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            };
        }

        return {
          jsonrpc: "2.0",
          id: reqId,
          result: {
            content: [{ type: "text", text: JSON.stringify(toolOutput, null, 2) }],
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: "2.0",
          id: reqId,
          result: {
            isError: true,
            content: [{ type: "text", text: err?.message || "Tool execution failed" }],
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id: reqId,
        error: { code: -32601, message: `Method not found: ${body.method}` },
      };
  }
}
