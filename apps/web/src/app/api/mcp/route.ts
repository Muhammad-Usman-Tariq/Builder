import { NextResponse } from "next/server";
import { handleMcpHttpRequest } from "@builder/mcp";

export async function POST(req: Request) {
  return handleMcpHttpRequest(req);
}

export async function GET() {
  return NextResponse.json({
    name: "builder-mcp",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    description: "Builder visual SaaS MCP server endpoint",
    tools: [
      "get_site_structure",
      "list_pages",
      "update_text",
      "create_section",
    ],
  });
}
