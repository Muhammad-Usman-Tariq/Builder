import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { eq, and, desc } from "drizzle-orm";
import { createBlankDocument } from "@builder/document";
import { appRouter } from "../server/routers/_app";
import { POST as handleMcpPost, GET as handleMcpGet } from "../app/api/mcp/route";

// Auto-load .env for local testing
const envFile = path.resolve(process.cwd(), "../../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { isConfiguredDatabaseUrl } from "./test-helpers.js";

const testDbUrl = process.env["DATABASE_URL_TEST"];
const isDbConfigured = isConfiguredDatabaseUrl(testDbUrl);
if (!isDbConfigured) {
  console.info("SKIP: DATABASE_URL_TEST is not configured or is a placeholder. Skipping M10 acceptance tests.");
}

describe.skipIf(!isDbConfigured)(
  "Milestone M10 Acceptance Test: MCP Server Endpoint, Tools, Approvals, and Management Router",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let testSiteId: string;
    let testApiKey: string;
    let caller: ReturnType<typeof appRouter.createCaller>;
    let headingElementId: string;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m10_acc_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m10_acc_${Math.random().toString(36).substring(2, 8)}`;
      testSiteId = `site_m10_acc_${Math.random().toString(36).substring(2, 8)}`;
      testApiKey = `bld_acc_${randomUUID().replace(/-/g, "")}`;

      // 1. Create User and Workspace
      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "MCP Acceptance Tester",
        email: `tester_m10_acc_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values({
        id: testWsId,
        name: "MCP Acceptance Workspace",
        slug: `m10-acc-${Date.now()}`,
        ownerId: testUserId,
        plan: "pro",
      });

      await dbClient.db.insert(schema.workspaceMembers).values({
        id: `wm_m10_acc_${Math.random().toString(36).substring(2, 8)}`,
        workspaceId: testWsId,
        userId: testUserId,
        role: "OWNER",
      });

      // 2. Create API key
      await dbClient.db.insert(schema.apiKeys).values({
        id: `key_${randomUUID().slice(0, 8)}`,
        workspaceId: testWsId,
        key: testApiKey,
        name: "Acceptance Test Key",
      });

      // 3. Create Site and Document
      const blankDoc = createBlankDocument("Home");
      const pageId = Object.keys(blankDoc.pages)[0]!;
      const rootId = blankDoc.pages[pageId]!.rootId;

      headingElementId = `head_${randomUUID().slice(0, 8)}`;
      blankDoc.elements[headingElementId] = {
        id: headingElementId,
        type: "Heading",
        name: "Title",
        parentId: rootId,
        children: [],
        props: { text: "Original MCP Title", level: 1 },
        styleIds: [],
        origin: "user",
      };
      blankDoc.elements[rootId]!.children.push(headingElementId);

      await dbClient.db.insert(schema.sites).values({
        id: testSiteId,
        workspaceId: testWsId,
        name: "MCP Acceptance Site",
        slug: "m10-acc-site",
      });

      await dbClient.db.insert(schema.siteDocuments).values({
        siteId: testSiteId,
        snapshot: blankDoc,
        schemaVersion: 1,
      });

      // 4. Create tRPC caller
      caller = appRouter.createCaller({
        db: dbClient.db,
        auth: {} as any,
        headers: new Headers(),
        session: {
          id: `sess_m10_${Math.random().toString(36).substring(2, 8)}`,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          token: "tok_m10_acc",
        } as any,
        user: {
          id: testUserId,
          name: "MCP Acceptance Tester",
          email: `tester_m10_acc_${Date.now()}@example.com`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      });
    });

    afterAll(async () => {
      if (dbClient) {
        await closeAllDbConnections();
      }
    });

    it("HTTP GET /mcp returns server information and list of available tools", async () => {
      const res = await handleMcpGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("builder-mcp");
      expect(data.tools).toContain("get_site_structure");
      expect(data.tools).toContain("list_pages");
      expect(data.tools).toContain("update_text");
      expect(data.tools).toContain("create_section");
    });

    it("HTTP POST /mcp enforces authorization, lists tools, and executes queries", async () => {
      // 1. Missing auth -> 401
      const unauthReq = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      const unauthRes = await handleMcpPost(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Valid token -> tools/list
      const listReq = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      });
      const listRes = await handleMcpPost(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.result?.tools?.length).toBe(5);
      expect(listData.result?.tools?.some((t: any) => t.name === "list_sites")).toBe(true);

      // 3. tools/call: get_site_structure
      const callReq = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "get_site_structure",
            arguments: { siteId: testSiteId },
          },
        }),
      });
      const callRes = await handleMcpPost(callReq);
      expect(callRes.status).toBe(200);
      const callData = await callRes.json();
      const content = JSON.parse(callData.result.content[0].text);
      expect(content.siteId).toBe(testSiteId);
      expect(content.pagesCount).toBe(1);
    });

    it("HTTP POST /mcp executes update_text, mutates document via pure commands, and writes audit log", async () => {
      const updateReq = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "update_text",
            arguments: {
              siteId: testSiteId,
              elementId: headingElementId,
              text: "Fresh Text via HTTP MCP",
            },
          },
        }),
      });

      const updateRes = await handleMcpPost(updateReq);
      expect(updateRes.status).toBe(200);
      const updateData = await updateRes.json();
      const content = JSON.parse(updateData.result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.updatedText).toBe("Fresh Text via HTTP MCP");

      // Verify DB document updated
      const [docRecord] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      expect(
        (docRecord!.snapshot as any).elements[headingElementId]?.props?.text
      ).toBe("Fresh Text via HTTP MCP");

      // Verify audit log
      const [audit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:update_text")
          )
        );

      expect(audit).toBeDefined();
    });

    it("HTTP POST /mcp create_section asks for confirmation first, then inserts upon approval", async () => {
      const [docRecord] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      const pageId = Object.keys((docRecord!.snapshot as any).pages)[0]!;

      // 1. Initial request without confirmation -> status: requires_approval
      const req1 = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "create_section",
            arguments: {
              siteId: testSiteId,
              pageId,
              sectionType: "cta",
              name: "Newsletter CTA",
              confirmed: false,
            },
          },
        }),
      });

      const res1 = await handleMcpPost(req1);
      const data1 = await res1.json();
      const payload1 = JSON.parse(data1.result.content[0].text);
      expect(payload1.status).toBe("requires_approval");
      expect(payload1.confirmationToken).toBeDefined();

      // 2. Approved request with confirmationToken -> status: created
      const req2 = new Request("http://localhost:3000/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "create_section",
            arguments: {
              siteId: testSiteId,
              pageId,
              sectionType: "cta",
              name: "Newsletter CTA",
              confirmed: true,
              confirmationToken: payload1.confirmationToken,
            },
          },
        }),
      });

      const res2 = await handleMcpPost(req2);
      const data2 = await res2.json();
      const payload2 = JSON.parse(data2.result.content[0].text);
      expect(payload2.status).toBe("created");
      expect(payload2.elementsCount).toBe(4);
    });
    it("Official MCP SDK Client with StreamableHTTPClientTransport against /api/mcp connects with token, lists tools, calls get_site_structure, calls create_section through confirmation flow, and writes audit_log", async () => {
      const { Client, StreamableHTTPClientTransport } = await import("@builder/mcp");

      const client = new Client(
        { name: "web-acceptance-mcp-client", version: "1.0.0" },
        { capabilities: {} }
      );

      const transport = new StreamableHTTPClientTransport(
        new URL("http://localhost:3000/api/mcp"),
        {
          requestInit: {
            headers: {
              Authorization: `Bearer ${testApiKey}`,
            },
          },
          fetch: async (url, init) => {
            const req = new Request(url, init);
            return handleMcpPost(req);
          },
        }
      );

      await client.connect(transport as any);

      // 1. List tools
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain("get_site_structure");
      expect(toolNames).toContain("create_section");

      // 2. Call get_site_structure
      const structureResult: any = await client.callTool({
        name: "get_site_structure",
        arguments: { siteId: testSiteId },
      });
      expect(structureResult.content).toBeDefined();
      const parsedStructure = JSON.parse(structureResult.content[0].text);
      expect(parsedStructure.siteId).toBe(testSiteId);
      const targetPageId = parsedStructure.pages[0].id;

      // 3. Call create_section without confirmation -> expects requires_approval
      const approvalResult: any = await client.callTool({
        name: "create_section",
        arguments: {
          siteId: testSiteId,
          pageId: targetPageId,
          sectionType: "features",
          name: "SDK Features Section",
          confirmed: false,
        },
      });
      const parsedApproval = JSON.parse(approvalResult.content[0].text);
      expect(parsedApproval.status).toBe("requires_approval");
      expect(parsedApproval.confirmationToken).toBeDefined();

      // 4. Call create_section with confirmation -> creates section
      const confirmResult: any = await client.callTool({
        name: "create_section",
        arguments: {
          siteId: testSiteId,
          pageId: targetPageId,
          sectionType: "features",
          name: "SDK Features Section",
          confirmed: true,
          confirmationToken: parsedApproval.confirmationToken,
        },
      });
      const parsedConfirm = JSON.parse(confirmResult.content[0].text);
      expect(parsedConfirm.status).toBe("created");
      expect(parsedConfirm.sectionId).toBeDefined();

      // 5. Verify audit_log row in database
      const [executedAudit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:executed")
          )
        )
        .orderBy(desc(schema.auditLog.createdAt));
      expect(executedAudit).toBeDefined();
      expect(executedAudit?.target).toBe(`${testSiteId}:${parsedConfirm.sectionId}`);
      expect((executedAudit?.data as any)?.sectionId).toBe(parsedConfirm.sectionId);

      await client.close();
    });

    it("tRPC mcpRouter manages API keys and external remote MCP server integrations", async () => {
      // 1. Create a new API key
      const createdKey = await caller.mcp.createApiKey({
        workspaceId: testWsId,
        name: "Automation Key",
      });

      expect(createdKey.key).toMatch(/^bld_/);
      expect(createdKey.name).toBe("Automation Key");

      // 2. List API keys
      const listKeys = await caller.mcp.listApiKeys({ workspaceId: testWsId });
      expect(listKeys.length).toBeGreaterThanOrEqual(2);
      expect(listKeys.some((k) => k.id === createdKey.id)).toBe(true);

      // 3. Configure external remote MCP server
      const configRes = await caller.mcp.configureExternalServer({
        workspaceId: testWsId,
        url: "https://mcp.external-vendor.com/sse",
        token: "ext_token_123",
      });
      expect(configRes.success).toBe(true);

      // 4. Get configured external server
      const extServer = await caller.mcp.getExternalServer({ workspaceId: testWsId });
      expect(extServer.configured).toBe(true);
      expect(extServer.server?.url).toBe("https://mcp.external-vendor.com/sse");

      // 5. Remove external server
      const removeRes = await caller.mcp.removeExternalServer({ workspaceId: testWsId });
      expect(removeRes.success).toBe(true);

      const extServerAfter = await caller.mcp.getExternalServer({ workspaceId: testWsId });
      expect(extServerAfter.configured).toBe(false);

      // 6. Revoke created API key
      const revokeRes = await caller.mcp.revokeApiKey({
        workspaceId: testWsId,
        keyId: createdKey.id,
      });
      expect(revokeRes.success).toBe(true);
    });
  }
);
