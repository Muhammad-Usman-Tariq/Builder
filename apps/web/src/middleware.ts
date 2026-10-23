import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/mcp") {
    const accept = req.headers.get("accept") || "";
    // If request is POST (JSON-RPC) or text/event-stream or application/json without text/html, rewrite to /api/mcp
    if (
      req.method === "POST" ||
      accept.includes("text/event-stream") ||
      (accept.includes("application/json") && !accept.includes("text/html"))
    ) {
      return NextResponse.rewrite(new URL("/api/mcp", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/mcp"],
};
