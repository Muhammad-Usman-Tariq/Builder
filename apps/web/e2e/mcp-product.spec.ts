import { test, expect } from "./fixtures";

test.describe("G: MCP in Product E2E", () => {
  test("creates read-write and read-only tokens, tests tool permissions, revokes token, and verifies 401 rejection", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const timestamp = Date.now();
    const testUser = {
      name: `MCP Product Tester ${timestamp}`,
      email: `mcp_user_${timestamp}@example.com`,
      password: "Password123!",
      siteName: `MCP Managed Site ${timestamp}`,
    };

    // 1. Sign up
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Doe").fill(testUser.name);
    await page.getByPlaceholder("jane@example.com").fill(testUser.email);
    await page.getByPlaceholder("••••••••").fill(testUser.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    // 2. Dashboard - Verify MCP & API link in top header
    await page.waitForURL("/dashboard", { timeout: 15000 });
    const mcpNavLink = page.getByTestId("mcp-nav-link");
    await expect(mcpNavLink).toBeVisible({ timeout: 10000 });

    // 3. Create a blank website to have a siteId for MCP tools
    const blankSiteBtn = page.getByRole("button", { name: /Blank site/i }).first();
    await expect(blankSiteBtn).toBeVisible({ timeout: 10000 });
    await blankSiteBtn.click();

    await page.getByPlaceholder("My Awesome Website").fill(testUser.siteName);
    await page.getByRole("button", { name: "Create Website" }).click();

    await page.waitForURL(/\/editor\/(site_[a-zA-Z0-9_-]+)/, { timeout: 15000 });
    const match = page.url().match(/\/editor\/(site_[a-zA-Z0-9_-]+)/);
    const siteId = match ? match[1]! : "";
    expect(siteId).toBeTruthy();

    // Verify editor top bar has "Connect AI agent (MCP)" button
    const mcpEditorBtn = page.getByTestId("mcp-editor-btn");
    await expect(mcpEditorBtn).toBeVisible({ timeout: 5000 });
    await expect(mcpEditorBtn).toHaveAttribute("href", "/mcp");

    // Verify Editor Right Panel shows Site ID and Copy button (Batch E.3)
    const editorSiteId = page.getByTestId("editor-site-id");
    await expect(editorSiteId).toBeVisible({ timeout: 5000 });
    await expect(editorSiteId).toHaveText(siteId);
    const copySiteIdBtn = page.getByTestId("copy-site-id-btn");
    await expect(copySiteIdBtn).toBeVisible();
    await copySiteIdBtn.click();
    await expect(page.getByText("Copied!")).toBeVisible({ timeout: 5000 });

    // 4. Navigate to /mcp
    await page.goto("/mcp");
    await expect(page.getByRole("heading", { name: /Model Context Protocol/i })).toBeVisible({
      timeout: 10000,
    });

    // 5. Connect Tab: Check endpoint URL and copy button
    await expect(page.getByTestId("tab-connect")).toBeVisible();
    const copyEndpointBtn = page.getByTestId("copy-endpoint-btn");
    await expect(copyEndpointBtn).toBeVisible();
    await copyEndpointBtn.click();
    await expect(page.getByText("Copied!")).toBeVisible({ timeout: 5000 });

    // Check Workspace Sites & IDs section (Batch E.3)
    const mcpSiteId = page.getByTestId(`site-id-display-${siteId}`);
    await expect(mcpSiteId).toBeVisible({ timeout: 5000 });
    await expect(mcpSiteId).toHaveText(siteId);
    const copyMcpSiteIdBtn = page.getByTestId(`copy-site-id-${siteId}`);
    await expect(copyMcpSiteIdBtn).toBeVisible();
    await copyMcpSiteIdBtn.click();
    await expect(copyMcpSiteIdBtn).toHaveText("Copied!");

    // Check localhost warning presence
    const localhostWarning = page.getByTestId("localhost-warning");
    await expect(localhostWarning).toBeVisible();

    // 6. Tokens Tab: Create a read-write token
    await page.getByTestId("tab-tokens").click();
    await page.getByTestId("create-token-btn").click();

    await page.getByTestId("token-name-input").fill("E2E Read-Write Token");
    await page.getByTestId("token-permission-select").selectOption("read-write");
    await page.getByTestId("submit-create-token-btn").click();

    // Verify token is displayed ONCE in highlighted box
    const createdBox = page.getByTestId("created-token-box");
    await expect(createdBox).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText("Copy it now — you will not be able to see it again.")
    ).toBeVisible();

    const rawTokenInput = page.getByTestId("created-token-value");
    const rawRwToken = await rawTokenInput.inputValue();
    expect(rawRwToken).toMatch(/^bld_[a-f0-9]{32}/i);

    // Test Copy button
    await page.getByTestId("copy-token-btn").click();
    await expect(page.getByText("Copied!")).toBeVisible({ timeout: 5000 });

    // Click Done to dismiss created token box
    await page.getByRole("button", { name: "Done" }).click();
    await expect(createdBox).not.toBeVisible();

    // Verify token in table has prefix only (not full raw token)
    const tokensTable = page.getByTestId("tokens-table");
    await expect(tokensTable.getByText("E2E Read-Write Token")).toBeVisible();
    await expect(tokensTable.getByText("read-write", { exact: true })).toBeVisible();
    await expect(tokensTable.getByText(rawRwToken)).not.toBeVisible(); // Full raw token NOT in table
    await expect(tokensTable.getByText(rawRwToken.slice(0, 8))).toBeVisible(); // Prefix visible

    // 7. Create a read-only token
    await page.getByTestId("create-token-btn").click();
    await page.getByTestId("token-name-input").fill("E2E Read-Only Token");
    await page.getByTestId("token-permission-select").selectOption("read-only");
    await page.getByTestId("submit-create-token-btn").click();

    await expect(page.getByTestId("created-token-box")).toBeVisible({ timeout: 10000 });
    const rawRoToken = await page.getByTestId("created-token-value").inputValue();
    expect(rawRoToken).toMatch(/^bld_[a-f0-9]{32}/i);
    await page.getByRole("button", { name: "Done" }).click();

    await expect(tokensTable.getByText("E2E Read-Only Token")).toBeVisible();
    await expect(tokensTable.getByText("read-only", { exact: true })).toBeVisible();

    // 8. Test MCP HTTP API with read-only token:
    // 8a. Read tool (list_pages) must succeed
    const listPagesRes = await page.request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${rawRoToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "list_pages",
          arguments: { siteId },
        },
      },
    });
    if (!listPagesRes.ok()) {
      console.log("listPagesRes status:", listPagesRes.status(), await listPagesRes.text());
    }
    expect(listPagesRes.ok()).toBe(true);
    const listPagesJson = await listPagesRes.json();
    expect(listPagesJson.result).toBeDefined();
    expect(listPagesJson.result.isError).toBeFalsy();

    // 8b. Write tool (create_section) must fail with permission denied
    const createSecDeniedRes = await page.request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${rawRoToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "create_section",
          arguments: {
            siteId,
            pageId: "page-home",
            sectionType: "hero",
          },
        },
      },
    });
    expect(createSecDeniedRes.ok()).toBe(true);
    const createSecDeniedJson = await createSecDeniedRes.json();
    expect(createSecDeniedJson.result?.isError).toBe(true);
    expect(createSecDeniedJson.result?.content?.[0]?.text).toContain(
      "Permission denied: token has read-only access"
    );

    // 9. Test MCP HTTP API with read-write token:
    // Write tool (create_section) succeeds without permission error
    const createSecRwRes = await page.request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${rawRwToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "create_section",
          arguments: {
            siteId,
            pageId: "page-home",
            sectionType: "hero",
          },
        },
      },
    });
    expect(createSecRwRes.ok()).toBe(true);
    const createSecRwJson = await createSecRwRes.json();
    expect(createSecRwJson.result?.content?.[0]?.text).not.toContain("Permission denied");

    // 10. Revoke read-write token
    // Find the row for E2E Read-Write Token and click its Revoke button
    const rwRow = tokensTable.locator("tr", { hasText: "E2E Read-Write Token" });
    await rwRow.getByTestId("revoke-token-btn").click();
    await page.getByTestId("confirm-revoke-btn").click();

    // Verify token is removed from table
    await expect(tokensTable.getByText("E2E Read-Write Token")).not.toBeVisible({ timeout: 10000 });

    // 11. Verify that call with revoked token is rejected with 401
    const revokedCallRes = await page.request.post("/api/mcp", {
      headers: {
        Authorization: `Bearer ${rawRwToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      },
    });
    expect(revokedCallRes.status()).toBe(401);

    // 12. Check Activity tab (Batch E.4)
    await page.getByTestId("tab-activity").click();
    const activityTable = page.getByTestId("activity-table");
    await expect(activityTable).toBeVisible();
    // Verify recent recorded activity contains create_section calls and denied outcome
    await expect(activityTable.getByText("create_section").first()).toBeVisible({ timeout: 10000 });
    await expect(activityTable.getByText("denied").first()).toBeVisible();

    // Verify Pending approval shows Approve and Reject buttons (Batch E.4)
    const approveBtn = activityTable.locator("button", { hasText: "Approve" }).first();
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    const rejectBtn = activityTable.locator("button", { hasText: "Reject" }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 5000 });

    // Click Approve on the pending request
    await approveBtn.click();

    // After approval, wait for activity refresh and check success status
    await expect(activityTable.getByText("success").first()).toBeVisible({ timeout: 10000 });
  });
});
