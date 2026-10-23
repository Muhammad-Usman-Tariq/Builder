import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`enc_${plaintext}`),
    decryptString: (encrypted: Buffer) => encrypted.toString().replace(/^enc_/, ""),
  },
  app: {
    getPath: () => "./scratch",
  },
}));

import { parseDeepLink, findDeepLinkInArgv, buildEditorUrl } from "../deep-link";
import { isSafeExternalUrl, isAllowedAppUrl } from "../security";
import { renderFallbackHtml } from "../fallback";
import { createApplicationMenuTemplate } from "../menu";

describe("Desktop Deep Link Protocol", () => {
  it("parses valid builder://site/<siteId> format", () => {
    const res = parseDeepLink("builder://site/site_12345");
    expect(res).not.toBeNull();
    expect(res?.siteId).toBe("site_12345");
  });

  it("parses builder:///site/<siteId> format with leading triple slash", () => {
    const res = parseDeepLink("builder:///site/site_abc-def_99");
    expect(res).not.toBeNull();
    expect(res?.siteId).toBe("site_abc-def_99");
  });

  it("parses deep link with query parameters or trailing slashes", () => {
    const res = parseDeepLink("builder://site/site_omega/?page=p1&foo=bar");
    expect(res).not.toBeNull();
    expect(res?.siteId).toBe("site_omega");
  });

  it("rejects non-builder protocols", () => {
    expect(parseDeepLink("https://site/site_123")).toBeNull();
    expect(parseDeepLink("custom://site/site_123")).toBeNull();
    expect(parseDeepLink("file:///site/site_123")).toBeNull();
  });

  it("rejects unknown path structures", () => {
    expect(parseDeepLink("builder://unknown/site_123")).toBeNull();
    expect(parseDeepLink("builder://site/")).toBeNull();
    expect(parseDeepLink("builder://")).toBeNull();
  });

  it("rejects invalid siteId characters (XSS/path injection prevention)", () => {
    expect(parseDeepLink("builder://site/<script>alert(1)</script>")).toBeNull();
    expect(parseDeepLink("builder://site/../../etc/passwd")).toBeNull();
    expect(parseDeepLink("builder://site/site%20id")).toBeNull();
  });

  it("finds deep link in command-line arguments array", () => {
    const argv = [
      "C:\\Program Files\\Builder\\Builder.exe",
      "--no-sandbox",
      "builder://site/site_from_argv_123",
      "--flag=true",
    ];
    const found = findDeepLinkInArgv(argv);
    expect(found).toBe("builder://site/site_from_argv_123");
  });

  it("returns null if no deep link present in argv", () => {
    const argv = ["Builder.exe", "--inspect", "--dev"];
    expect(findDeepLinkInArgv(argv)).toBeNull();
    expect(findDeepLinkInArgv([])).toBeNull();
  });

  it("builds correct editor URL", () => {
    expect(buildEditorUrl("http://localhost:3000", "site_test_1")).toBe(
      "http://localhost:3000/editor/site_test_1"
    );
    expect(buildEditorUrl("https://app.builder.io/", "site_test_2")).toBe(
      "https://app.builder.io/editor/site_test_2"
    );
  });
});

describe("Desktop Security URL Validation", () => {
  it("allows safe http and https external URLs", () => {
    expect(isSafeExternalUrl("https://builder.io/docs")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000/help")).toBe(true);
    expect(isSafeExternalUrl("https://github.com/org/repo")).toBe(true);
  });

  it("rejects unsafe or non-web protocols", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(isSafeExternalUrl("vbscript:MsgBox(1)")).toBe(false);
    expect(isSafeExternalUrl("blob:https://example.com/uuid")).toBe(false);
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl("   ")).toBe(false);
  });

  it("validates in-app allowed origin navigations", () => {
    const base = "https://app.builder.io";
    expect(isAllowedAppUrl("https://app.builder.io/editor/s1", base)).toBe(true);
    expect(isAllowedAppUrl("https://app.builder.io/login", base)).toBe(true);
    expect(isAllowedAppUrl("https://app.builder.io/dashboard", base)).toBe(true);

    // Disallowed different origins
    expect(isAllowedAppUrl("https://malicious-site.com/editor/s1", base)).toBe(false);
    expect(isAllowedAppUrl("http://app.builder.io/editor/s1", base)).toBe(false); // different protocol
    expect(isAllowedAppUrl("https://app.builder.io:8080/editor/s1", base)).toBe(false); // different port
  });
});

describe("Desktop Fallback Screen", () => {
  it("renders offline fallback HTML with escaped target URL and retry action", () => {
    const html = renderFallbackHtml("http://localhost:3000/editor/s1", "ERR_CONNECTION_REFUSED");
    expect(html).toContain("Unable to reach Builder");
    expect(html).toContain("http://localhost:3000/editor/s1");
    expect(html).toContain("ERR_CONNECTION_REFUSED");
    expect(html).toContain("Retry Connection");
    expect(html).toContain('id="retry-btn"');
  });

  it("properly escapes HTML to prevent XSS in error descriptions or URLs", () => {
    const malicious = '<script>alert("xss")</script>';
    const html = renderFallbackHtml(malicious, malicious);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });
});

describe("Desktop Application Menu", () => {
  it("constructs menu template containing standard application controls", () => {
    const mockApp = { name: "Builder" } as any;
    const mockShell = { openExternal: vi.fn() } as any;
    const template = createApplicationMenuTemplate(mockApp, mockShell, "http://localhost:3000");

    const labels = template.map((item) => item.label || item.role);
    expect(labels).toContain("File");
    expect(labels).toContain("Edit");
    expect(labels).toContain("View");
    expect(labels).toContain("Window");
    expect(labels).toContain("help");
  });
});

describe("Desktop OS Keychain Token Storage (safeStorage)", () => {
  it("checks encryption availability and handles token lifecycle gracefully", async () => {
    const { isEncryptionAvailable, saveToken, getToken, clearToken } = await import(
      "../auth-storage"
    );

    // In non-Electron test runtime, safeStorage is gracefully checked
    expect(typeof isEncryptionAvailable()).toBe("boolean");

    // Clear any token
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("Desktop App URL Resolution & Fallback", () => {
  it("resolves APP_URL directly from environment variable", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: { APP_URL: "https://my-builder-instance.com" },
    });
    expect(result.appUrl).toBe("https://my-builder-instance.com");
    expect(result.error).toBeUndefined();
  });

  it("resolves BUILDER_APP_URL with priority or as alias", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: {
        BUILDER_APP_URL: "http://localhost:3001",
        APP_URL: "http://localhost:3000",
      },
    });
    expect(result.appUrl).toBe("http://localhost:3001");
    expect(result.error).toBeUndefined();
  });

  it("loads APP_URL from root .env in development when env is not set", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: {},
      readEnvFile: () => 'APP_URL="http://localhost:3000"\n',
      isPackaged: false,
    });
    expect(result.appUrl).toBe("http://localhost:3000");
    expect(result.error).toBeUndefined();
  });

  it("returns configured error message when URL is missing completely", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: { APP_URL: undefined, BUILDER_APP_URL: undefined },
      startDir: null,
      readEnvFile: () => null,
      isPackaged: false,
    });
    expect(result.appUrl).toBeNull();
    expect(result.error).toBe("Builder address is not configured — set APP_URL");
  });

  it("returns configured error message when URL is invalid", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: { APP_URL: "invalid-not-a-url" },
    });
    expect(result.appUrl).toBeNull();
    expect(result.error).toBe("Builder address is not configured — set APP_URL");
  });

  it("rejects non-http/https protocols as invalid URL", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: { APP_URL: "ftp://files.builder.io" },
    });
    expect(result.appUrl).toBeNull();
    expect(result.error).toBe("Builder address is not configured — set APP_URL");
  });

  it("uses build-time embedded URL for packaged builds when available", async () => {
    const { resolveAppUrl } = await import("../url-resolver");
    const result = resolveAppUrl({
      env: {},
      isPackaged: true,
      embeddedUrl: "https://production-app.builder.io",
    });
    expect(result.appUrl).toBe("https://production-app.builder.io");
    expect(result.error).toBeUndefined();
  });

  it("renders configuration error screen with 'Builder address is not configured — set APP_URL'", async () => {
    const { renderMissingUrlHtml } = await import("../fallback");
    const html = renderMissingUrlHtml();
    expect(html).toContain("Builder address is not configured — set APP_URL");
    expect(html).toContain("data-testid=\"missing-url-heading\"");
    expect(html).not.toContain("ERR_INVALID_URL");
  });
});

