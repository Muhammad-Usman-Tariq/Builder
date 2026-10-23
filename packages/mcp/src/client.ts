import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export { Client } from "@modelcontextprotocol/sdk/client/index.js";
export { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
export { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface RemoteMcpServerConfig {
  url: string;
  token?: string | undefined;
}

export interface RemoteMcpTool {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
}

/**
 * Connects to a remote MCP server via SSE / HTTP and inspects available tools.
 * Architecture Section 13.3.
 */
export async function connectRemoteMcpServer(config: RemoteMcpServerConfig): Promise<{
  client: Client;
  tools: RemoteMcpTool[];
  close: () => Promise<void>;
}> {
  const client = new Client({
    name: "builder-mcp-client",
    version: "1.0.0",
  });

  const headers: Record<string, string> = {};
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  }

  const transport = new SSEClientTransport(new URL(config.url), {
    eventSourceInit: {
      headers,
    } as any,
    requestInit: {
      headers,
    },
  });

  await client.connect(transport);

  // List tools from the remote server
  const toolsResult = await client.listTools();
  const tools: RemoteMcpTool[] = (toolsResult.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, unknown>) || {},
  }));

  return {
    client,
    tools,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * Direct HTTP JSON-RPC caller for external MCP endpoints that expose standard POST /mcp.
 */
export async function callRemoteMcpHttp(
  url: string,
  token: string | undefined,
  method: string,
  params?: Record<string, unknown>
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: params || {},
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Remote MCP server error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  if (data.error) {
    throw new Error(`Remote MCP error (${data.error.code}): ${data.error.message}`);
  }

  return data.result;
}
