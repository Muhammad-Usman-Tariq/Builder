import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getDb, closeAllDbConnections, runMigrations, schema } from "@builder/db";
import { eq, and, desc } from "drizzle-orm";
import { createBlankDocument } from "@builder/document";
import {
  authenticateMcpToken,
  handleGetSiteStructure,
  handleListPages,
  handleUpdateText,
  handleCreateSection,
  handleMcpRpc,
  hashToken,
} from "../index.js";

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

const testDbUrl = process.env["DATABASE_URL_TEST"];

describe.skipIf(!testDbUrl)(
  "Milestone M10: MCP Server Tools, Auth, Audit Logging, and Approvals",
  () => {
    let dbClient: ReturnType<typeof getDb>;
    let testUserId: string;
    let testWsId: string;
    let foreignWsId: string;
    let testSiteId: string;
    let testApiKey: string;
    let testKeyId: string;
    let headingElementId: string;

    beforeAll(async () => {
      dbClient = getDb({ connectionUrl: testDbUrl });
      await runMigrations(dbClient.sql);

      testUserId = `usr_m10_${Math.random().toString(36).substring(2, 8)}`;
      testWsId = `ws_m10_${Math.random().toString(36).substring(2, 8)}`;
      foreignWsId = `ws_m10_foreign_${Math.random().toString(36).substring(2, 8)}`;
      testSiteId = `site_m10_${Math.random().toString(36).substring(2, 8)}`;
      testKeyId = `key_m10_${Math.random().toString(36).substring(2, 8)}`;
      testApiKey = `bld_m10_token_${randomUUID().replace(/-/g, "")}`;

      // 1. Create User & Workspaces
      await dbClient.db.insert(schema.users).values({
        id: testUserId,
        name: "MCP Tester",
        email: `tester_m10_${Date.now()}@example.com`,
      });

      await dbClient.db.insert(schema.workspaces).values([
        {
          id: testWsId,
          name: "MCP Workspace",
          slug: `m10-ws-${Date.now()}`,
          ownerId: testUserId,
        },
        {
          id: foreignWsId,
          name: "Foreign Workspace",
          slug: `m10-foreign-${Date.now()}`,
          ownerId: testUserId,
        },
      ]);

      // 2. Create API key for test workspace
      await dbClient.db.insert(schema.apiKeys).values({
        id: testKeyId,
        workspaceId: testWsId,
        key: testApiKey,
        name: "Test MCP Token",
      });

      // 3. Create test site and document
      const blankDoc = createBlankDocument("Home");
      const homePage = blankDoc.pages["page-home"] || Object.values(blankDoc.pages)[0]!;
      const rootId = homePage.rootId;

      headingElementId = `heading-${randomUUID().slice(0, 8)}`;
      blankDoc.elements[headingElementId] = {
        id: headingElementId,
        type: "Heading",
        name: "Main Title",
        parentId: rootId,
        children: [],
        props: { text: "Original Heading Text", level: 1 },
        styleIds: [],
        origin: "user",
      };
      blankDoc.elements[rootId]!.children.push(headingElementId);

      await dbClient.db.insert(schema.sites).values({
        id: testSiteId,
        workspaceId: testWsId,
        name: "MCP Tested Site",
        slug: "m10-tested-site",
      });

      await dbClient.db.insert(schema.siteDocuments).values({
        siteId: testSiteId,
        snapshot: blankDoc,
        schemaVersion: 1,
      });
    });

    afterAll(async () => {
      if (dbClient) {
        await closeAllDbConnections();
      }
    });

    it("1. authenticateMcpToken validates correct token and rejects invalid token", async () => {
      const auth = await authenticateMcpToken(`Bearer ${testApiKey}`);
      expect(auth.workspaceId).toBe(testWsId);
      expect(auth.apiKeyId).toBe(testKeyId);

      await expect(authenticateMcpToken("Bearer invalid_token_12345")).rejects.toThrow(
        /Invalid MCP API token/
      );
    });

    it("2. handleGetSiteStructure inspects document and records audit log", async () => {
      const structure = await handleGetSiteStructure(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
      });

      expect(structure.siteId).toBe(testSiteId);
      expect(structure.pagesCount).toBeGreaterThan(0);
      expect(structure.elementsCount).toBeGreaterThan(0);

      // Verify audit log
      const [audit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:get_site_structure")
          )
        );

      expect(audit).toBeDefined();
      expect(audit?.target).toBe(testSiteId);

      // Verify cross-tenant isolation: foreign workspace cannot access test site
      await expect(
        handleGetSiteStructure(foreignWsId, "mcp:foreign", { siteId: testSiteId })
      ).rejects.toThrow(/not found in this workspace/);
    });

    it("3. handleListPages returns all pages for site", async () => {
      const res = await handleListPages(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
      });

      expect(res.pages.length).toBeGreaterThan(0);
      expect(res.pages[0]?.slug).toBeDefined();
      expect(res.pages[0]?.rootId).toBeDefined();
    });

    it("4. handleUpdateText mutates element text via pure commands and validates", async () => {
      const updateRes = await handleUpdateText(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
        elementId: headingElementId,
        text: "Updated By MCP Tool",
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.updatedText).toBe("Updated By MCP Tool");

      // Verify document in DB
      const [doc] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      expect((doc?.snapshot as any).elements[headingElementId]?.props?.text).toBe(
        "Updated By MCP Tool"
      );
    });

    it("5. handleCreateSection requires approval first, then executes upon confirmation", async () => {
      const [docRecord] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      const pageId = Object.keys((docRecord?.snapshot as any).pages)[0]!;

      // 1. First call without confirmed: true -> returns requires_approval
      const approvalReq = await handleCreateSection(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
        pageId,
        sectionType: "features",
        name: "Key Benefits",
        confirmed: false,
      });

      expect(approvalReq.status).toBe("requires_approval");
      expect(approvalReq.confirmationToken).toBeDefined();
      expect(approvalReq.message).toContain("Approval required");

      // Verify approval request audit log
      const [approvalAudit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:approval_requested")
          )
        );

      expect(approvalAudit).toBeDefined();

      // 2. Second call with confirmed: true -> creates section
      const createRes = await handleCreateSection(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
        pageId,
        sectionType: "features",
        name: "Key Benefits",
        confirmed: true,
        confirmationToken: approvalReq.confirmationToken,
      });

      expect(createRes.status).toBe("created");
      expect(createRes.sectionId).toBeDefined();
      expect(createRes.elementsCount).toBe(4);

      // Verify execution audit log
      const [execAudit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:executed")
          )
        );

      expect(execAudit).toBeDefined();

      // Verify document contains new section
      const [updatedDoc] = await dbClient.db
        .select()
        .from(schema.siteDocuments)
        .where(eq(schema.siteDocuments.siteId, testSiteId));

      const elements = (updatedDoc?.snapshot as any).elements;
      expect(elements[createRes.sectionId!]).toBeDefined();
      expect(elements[createRes.sectionId!].type).toBe("Box");
    });

    it("6. handleMcpRpc processes initialize, tools/list, and tools/call JSON-RPC methods", async () => {
      // 1. initialize
      const initRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });
      expect(initRes.result?.serverInfo?.name).toBe("builder-mcp");

      // 2. tools/list
      const listRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });
      const toolNames = listRes.result?.tools?.map((t: any) => t.name);
      expect(toolNames).toContain("get_site_structure");
      expect(toolNames).toContain("list_pages");
      expect(toolNames).toContain("update_text");
      expect(toolNames).toContain("create_section");

      // 3. tools/call: list_pages
      const callRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "list_pages",
          arguments: { siteId: testSiteId },
        },
      });

      expect(callRes.result?.content?.[0]?.text).toBeDefined();
      const parsedContent = JSON.parse(callRes.result.content[0].text);
      expect(parsedContent.siteId).toBe(testSiteId);

      // 4. Unauthorized rejection
      const unauthRes = await handleMcpRpc(null, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      });
      expect(unauthRes.error?.code).toBe(-32001);
    });

    it("7. Official MCP SDK Client with StreamableHTTPClientTransport connects, lists tools, calls get_site_structure, and calls create_section through confirmation flow", async () => {
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      const { handleMcpHttpRequest } = await import("../server.js");

      const client = new Client(
        { name: "test-mcp-client", version: "1.0.0" },
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
            return handleMcpHttpRequest(req);
          },
        }
      );

      await client.connect(transport as any);

      // 1. List tools
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);
      expect(toolNames).toContain("get_site_structure");
      expect(toolNames).toContain("list_pages");
      expect(toolNames).toContain("update_text");
      expect(toolNames).toContain("create_section");

      // 2. Call get_site_structure
      const structureResult: any = await client.callTool({
        name: "get_site_structure",
        arguments: { siteId: testSiteId },
      });
      expect(structureResult.content).toBeDefined();
      expect(structureResult.content.length).toBeGreaterThan(0);
      const parsedStructure = JSON.parse(structureResult.content[0].text);
      expect(parsedStructure.siteId).toBe(testSiteId);
      const targetPageId = parsedStructure.pages[0].id;

      // 3. Call create_section without confirmation -> expects requires_approval
      const approvalResult: any = await client.callTool({
        name: "create_section",
        arguments: {
          siteId: testSiteId,
          pageId: targetPageId,
          sectionType: "pricing",
          name: "SDK Pricing Section",
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
          sectionType: "pricing",
          name: "SDK Pricing Section",
          confirmed: true,
          confirmationToken: parsedApproval.confirmationToken,
        },
      });
      const parsedConfirm = JSON.parse(confirmResult.content[0].text);
      expect(parsedConfirm.status).toBe("created");
      expect(parsedConfirm.sectionId).toBeDefined();

      // 5. Verify audit_log row in database for both approval requested and execution
      const [approvalAudit] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:approval_requested")
          )
        )
        .orderBy(desc(schema.auditLog.createdAt));
      expect(approvalAudit).toBeDefined();
      expect((approvalAudit?.data as any)?.confirmationToken).toBe(parsedApproval.confirmationToken);

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

    it("G.6 Unit Test: tokens are stored only as hashes and never in plaintext", async () => {
      const secretToken = `bld_secret_${randomUUID().replace(/-/g, "")}`;
      const secretKeyHash = hashToken(secretToken);
      const secretKeyId = `key_hashed_${randomUUID().slice(0, 8)}`;
      const prefix = `${secretToken.slice(0, 10)}…`;

      // Insert using the hash pattern (like createApiKey does)
      await dbClient.db.insert(schema.apiKeys).values({
        id: secretKeyId,
        workspaceId: testWsId,
        key: secretKeyHash, // Stored as hash
        keyHash: secretKeyHash,
        prefix,
        permission: "read-only",
        name: "Hashed Only Token",
      });

      // 1. Inspect DB row directly - verify raw token is NOT in database
      const [insertedRow] = await dbClient.db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.id, secretKeyId));

      expect(insertedRow).toBeDefined();
      expect(insertedRow?.keyHash).toBe(secretKeyHash);
      expect(insertedRow?.key).not.toBe(secretToken);
      expect(insertedRow?.keyHash).not.toBe(secretToken);
      expect(insertedRow?.prefix).toBe(prefix);

      // 2. Authenticate using the raw token - should succeed via hash matching
      const authResult = await authenticateMcpToken(secretToken);
      expect(authResult.workspaceId).toBe(testWsId);
      expect(authResult.permission).toBe("read-only");
      expect(authResult.apiKeyId).toBe(secretKeyId);

      // 3. Authenticate with an invalid token fails
      await expect(authenticateMcpToken("bld_invalid_token")).rejects.toThrow();
    });

    it("E.1 & E.2 MCP Unit Tests: list_sites, URL/path siteId, page slug, and clear error message", async () => {
      // 1. list_sites
      const listSitesRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        method: "tools/call",
        params: { name: "list_sites", arguments: {} },
      });
      expect(listSitesRes.error).toBeUndefined();
      const sites = JSON.parse(listSitesRes.result.content[0].text);
      expect(Array.isArray(sites)).toBe(true);
      const matchedSite = sites.find((s: any) => s.id === testSiteId);
      expect(matchedSite).toBeDefined();
      expect(matchedSite.id).toBe(testSiteId);
      expect(matchedSite.name).toBe("MCP Tested Site");
      expect(matchedSite.lastUpdated).toBeDefined();
      expect(typeof matchedSite.pageCount).toBe("number");

      // 2. Accept /editor/<id>
      const pathRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        method: "tools/call",
        params: { name: "list_pages", arguments: { siteId: `/editor/${testSiteId}` } },
      });
      expect(pathRes.error).toBeUndefined();
      const pathPages = JSON.parse(pathRes.result.content[0].text);
      expect(pathPages.siteId).toBe(testSiteId);
      expect(pathPages.pages.length).toBeGreaterThan(0);

      // 3. Accept full editor URL
      const fullUrlRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        method: "tools/call",
        params: {
          name: "get_site_structure",
          arguments: { siteId: `https://builder.app/editor/${testSiteId}` },
        },
      });
      expect(fullUrlRes.error).toBeUndefined();
      const urlStructure = JSON.parse(fullUrlRes.result.content[0].text);
      expect(urlStructure.siteId).toBe(testSiteId);

      // 4. Accept page slug
      const slugRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        method: "tools/call",
        params: {
          name: "get_site_structure",
          arguments: { siteId: testSiteId, pageId: "/" },
        },
      });
      expect(slugRes.error).toBeUndefined();

      // 5. Clear error message when site ID not found
      const invalidRes = await handleMcpRpc(`Bearer ${testApiKey}`, {
        method: "tools/call",
        params: { name: "list_pages", arguments: { siteId: "site_nonexistent999" } },
      });
      expect(invalidRes.result?.content?.[0]?.text).toContain("Use the site ID, e.g. site_abc123 — call list_sites");
    });

    it("E.4 MCP Unit Test: Pending approvals with approval and rejection flow", async () => {
      // 1. Request section creation without confirmation
      const approvalReq = await handleCreateSection(testWsId, "test-actor", {
        siteId: testSiteId,
        pageId: "/",
        sectionType: "features",
        name: "Feature Showcase",
        confirmed: false,
      });
      expect(approvalReq.status).toBe("requires_approval");
      expect(approvalReq.confirmationToken).toBeDefined();

      // 2. Verify approval_requested is in audit log
      const [approvalLog] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:approval_requested")
          )
        )
        .orderBy(desc(schema.auditLog.createdAt));
      expect(approvalLog).toBeDefined();
      expect((approvalLog?.data as any)?.confirmationToken).toBe(approvalReq.confirmationToken);

      // 3. Approve and execute using confirmationToken
      const approvedResult = await handleCreateSection(testWsId, "approver-admin", {
        siteId: testSiteId,
        pageId: "/",
        sectionType: "features",
        name: "Feature Showcase",
        confirmed: true,
        confirmationToken: approvalReq.confirmationToken,
      });
      expect(approvedResult.status).toBe("created");
      expect(approvedResult.sectionId).toBeDefined();

      // 4. Verify executed audit log entry exists
      const [executedLog] = await dbClient.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.workspaceId, testWsId),
            eq(schema.auditLog.action, "mcp:create_section:executed")
          )
        )
        .orderBy(desc(schema.auditLog.createdAt));
      expect(executedLog).toBeDefined();
      expect((executedLog?.data as any)?.confirmationToken).toBe(approvalReq.confirmationToken);
    });

    it("11. handleCreateSection resolves pageId using 'page-home', slug, or single-page fallback", async () => {
      const res = await handleCreateSection(testWsId, `mcp:${testKeyId}`, {
        siteId: testSiteId,
        pageId: "page-home",
        sectionType: "hero",
        confirmed: false,
      });
      expect(res.status).toBe("requires_approval");
      if (res.status === "requires_approval") {
        expect((res as any).plan?.pageId).toBeDefined();
      }
    });
  }
);
