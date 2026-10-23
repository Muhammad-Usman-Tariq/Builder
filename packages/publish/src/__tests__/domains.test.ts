import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  addProjectDomain,
  verifyProjectDomain,
  removeProjectDomain,
  computeDnsRecords,
} from "../vercel.js";

// Recorded Vercel API Response Fixtures
const RECORDED_ADD_APEX_RESPONSE = {
  name: "mybrand.com",
  apexName: "mybrand.com",
  projectId: "prj_builder_test_123",
  redirect: null,
  redirectStatusCode: null,
  gitBranch: null,
  updatedAt: 1718000000000,
  createdAt: 1718000000000,
  verified: false,
  verification: [
    {
      type: "TXT",
      domain: "_vercel.mybrand.com",
      value: "vc-domain-verify=mybrand.com,ab8912ef",
      reason: "Verify ownership of apex domain",
    },
  ],
};

const RECORDED_ADD_SUBDOMAIN_RESPONSE = {
  name: "www.mybrand.com",
  apexName: "mybrand.com",
  projectId: "prj_builder_test_123",
  redirect: null,
  redirectStatusCode: null,
  gitBranch: null,
  updatedAt: 1718000000000,
  createdAt: 1718000000000,
  verified: false,
  verification: [],
};

const RECORDED_VERIFY_PENDING_RESPONSE = {
  name: "mybrand.com",
  verified: false,
  verification: [
    {
      type: "TXT",
      domain: "_vercel.mybrand.com",
      value: "vc-domain-verify=mybrand.com,ab8912ef",
    },
  ],
};

const RECORDED_VERIFY_COMPLETE_RESPONSE = {
  name: "mybrand.com",
  apexName: "mybrand.com",
  verified: true,
  verification: [],
};

describe("E5: Custom Domain Management via Vercel Token", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("computeDnsRecords", () => {
    it("returns empty array and does not invent hardcoded records when none are returned", () => {
      const records = computeDnsRecords("mybrand.com");
      expect(records).toEqual([]);
      expect(records.some((r) => r.value === "76.76.21.21")).toBe(false);
      expect(records.some((r) => r.value === "cname.vercel-dns.com")).toBe(false);
    });

    it("returns verification challenges when returned by Vercel", () => {
      const records = computeDnsRecords("mybrand.com", [
        { type: "TXT", domain: "_vercel.mybrand.com", value: "vc-domain-verify=token" },
      ]);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({
        type: "TXT",
        name: "_vercel.mybrand.com",
        value: "vc-domain-verify=token",
        reason: "Domain ownership verification challenge",
      });
    });

    it("extracts explicit records and CNAMEs from Vercel API response object", () => {
      const records = computeDnsRecords({
        name: "blog.mybrand.com",
        records: [
          { type: "CNAME", name: "blog", value: "cname.vercel-dns.com", reason: "Vercel edge" },
        ],
      });
      expect(records).toHaveLength(1);
      expect(records[0]?.type).toBe("CNAME");
      expect(records[0]?.name).toBe("blog");
      expect(records[0]?.value).toBe("cname.vercel-dns.com");
    });
  });

  describe("addProjectDomain", () => {
    it("successfully adds apex domain and returns verification challenge from Vercel", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => RECORDED_ADD_APEX_RESPONSE,
      } as any);

      const status = await addProjectDomain("tok_test", "my-project", "mybrand.com");

      expect(status.name).toBe("mybrand.com");
      expect(status.verified).toBe(false);
      expect(status.sslStatus).toBe("pending");
      // Shows exact TXT record from Vercel verification, NOT hardcoded 76.76.21.21
      expect(status.records).toHaveLength(1);
      expect(status.records[0]?.type).toBe("TXT");
      expect(status.records.some((r) => r.value === "76.76.21.21")).toBe(false);
    });

    it("successfully adds subdomain with empty records when Vercel returns no challenges", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => RECORDED_ADD_SUBDOMAIN_RESPONSE,
      } as any);

      const status = await addProjectDomain("tok_test", "my-project", "www.mybrand.com");

      expect(status.name).toBe("www.mybrand.com");
      // Returns empty array when Vercel provides no records (triggers UI dashboard fallback)
      expect(status.records).toEqual([]);
      expect(status.records.some((r) => r.value === "cname.vercel-dns.com")).toBe(false);
    });

    it("returns records when Vercel API explicitly provides them", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...RECORDED_ADD_SUBDOMAIN_RESPONSE,
          records: [
            { type: "CNAME", name: "www", value: "cname.vercel-dns.com", reason: "Vercel CNAME" },
          ],
        }),
      } as any);

      const status = await addProjectDomain("tok_test", "my-project", "www.mybrand.com");
      expect(status.records).toHaveLength(1);
      expect(status.records[0]?.value).toBe("cname.vercel-dns.com");
    });

    it("throws clear error when Vercel API rejects domain", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "The domain 'invalid..domain' is not valid." },
        }),
      } as any);

      await expect(addProjectDomain("tok_test", "my-project", "invalid..domain")).rejects.toThrow(
        "The domain 'invalid..domain' is not valid."
      );
    });
  });

  describe("verifyProjectDomain", () => {
    it("returns pending status when domain DNS is not yet propagated", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => RECORDED_VERIFY_PENDING_RESPONSE,
      } as any);

      const status = await verifyProjectDomain("tok_test", "my-project", "mybrand.com");

      expect(status.verified).toBe(false);
      expect(status.sslStatus).toBe("pending");
    });

    it("returns verified and ready status when DNS propagation and SSL issue succeed", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => RECORDED_VERIFY_COMPLETE_RESPONSE,
      } as any);

      const status = await verifyProjectDomain("tok_test", "my-project", "mybrand.com");

      expect(status.verified).toBe(true);
      expect(status.sslStatus).toBe("ready");
    });

    it("returns error status with honest Vercel error message when verification fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: { message: "Domain is registered to another team or project." },
        }),
      } as any);

      const status = await verifyProjectDomain("tok_test", "my-project", "mybrand.com");

      expect(status.verified).toBe(false);
      expect(status.sslStatus).toBe("error");
      expect(status.error).toContain("Domain is registered to another team or project.");
    });
  });

  describe("removeProjectDomain", () => {
    it("removes domain from Vercel project cleanly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any);

      const result = await removeProjectDomain("tok_test", "my-project", "mybrand.com");
      expect(result.success).toBe(true);
    });
  });

  describe("Team-scoped Domain Calls", () => {
    it("passes teamId in addProjectDomain, verifyProjectDomain, removeProjectDomain", async () => {
      let addUrl = "";
      let verifyUrl = "";
      let removeUrl = "";

      global.fetch = vi.fn(async (url: any, init: any) => {
        const u = String(url);
        if (init?.method === "POST" && u.includes("/domains?")) {
          addUrl = u;
          return new Response(JSON.stringify(RECORDED_ADD_APEX_RESPONSE), { status: 200 });
        }
        if (init?.method === "POST" && u.includes("/verify?")) {
          verifyUrl = u;
          return new Response(JSON.stringify(RECORDED_VERIFY_COMPLETE_RESPONSE), { status: 200 });
        }
        if (init?.method === "DELETE") {
          removeUrl = u;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      await addProjectDomain("tok_test", "prj_123", "mybrand.com", "team_mock_123");
      expect(addUrl).toContain("/v10/projects/prj_123/domains?teamId=team_mock_123");

      await verifyProjectDomain("tok_test", "prj_123", "mybrand.com", "team_mock_123");
      expect(verifyUrl).toContain("/v9/projects/prj_123/domains/mybrand.com/verify?teamId=team_mock_123");

      await removeProjectDomain("tok_test", "prj_123", "mybrand.com", "team_mock_123");
      expect(removeUrl).toContain("/v9/projects/prj_123/domains/mybrand.com?teamId=team_mock_123");
    });
  });

  describe("Item 8: Domain Configuration and Status Verification", () => {
    const RECORDED_PROJECT_DOMAIN_FIXTURE = {
      name: "test.creator-demo.com",
      apexName: "creator-demo.com",
      projectId: "prj_builder_test_123",
      verified: true, // Project-level verified, but DNS may still be unconfigured
      verification: [],
    };

    const RECORDED_MISCONFIGURED_CONFIG = {
      configuredBy: null,
      misconfigured: true,
      recommended: {
        cnames: ["cname.vercel-dns.com"],
      },
    };

    const RECORDED_CONFIGURED_CONFIG = {
      configuredBy: "CNAME",
      misconfigured: false,
    };

    const RECORDED_TXT_PROJECT_DOMAIN = {
      name: "creator-demo.com",
      apexName: "creator-demo.com",
      projectId: "prj_builder_test_123",
      verified: false,
      verification: [
        {
          type: "TXT",
          domain: "_vercel.creator-demo.com",
          value: "vc-domain-verify=creator-demo.com,abcdef12",
          reason: "Domain ownership verification challenge",
        },
      ],
    };

    const RECORDED_TXT_CONFIG = {
      configuredBy: null,
      misconfigured: true,
      recommended: {
        aValues: ["76.76.21.21"],
      },
    };

    it("marks misconfigured domain as 'Pending DNS' and returns recommended CNAME record", async () => {
      global.fetch = vi.fn(async (url: any) => {
        const u = String(url);
        if (u.includes("/v6/domains/")) {
          return new Response(JSON.stringify(RECORDED_MISCONFIGURED_CONFIG), { status: 200 });
        }
        return new Response(JSON.stringify(RECORDED_PROJECT_DOMAIN_FIXTURE), { status: 200 });
      }) as any;

      const result = await addProjectDomain("tok_123", "prj_123", "test.creator-demo.com");

      expect(result.verified).toBe(false);
      expect(result.sslStatus).toBe("pending");
      expect(result.status).toBe("Pending DNS");
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toEqual({
        type: "CNAME",
        name: "test",
        value: "cname.vercel-dns.com",
        reason: "Subdomain CNAME returned by Vercel",
      });
    });

    it("marks configured domain as 'Verified & SSL ready' when verified AND not misconfigured", async () => {
      global.fetch = vi.fn(async (url: any) => {
        const u = String(url);
        if (u.includes("/v6/domains/")) {
          return new Response(JSON.stringify(RECORDED_CONFIGURED_CONFIG), { status: 200 });
        }
        return new Response(JSON.stringify(RECORDED_PROJECT_DOMAIN_FIXTURE), { status: 200 });
      }) as any;

      const result = await addProjectDomain("tok_123", "prj_123", "test.creator-demo.com");

      expect(result.verified).toBe(true);
      expect(result.sslStatus).toBe("ready");
      expect(result.status).toBe("Verified & SSL ready");
    });

    it("returns both TXT verification challenge and recommended A records for domain needing TXT verification", async () => {
      global.fetch = vi.fn(async (url: any) => {
        const u = String(url);
        if (u.includes("/v6/domains/")) {
          return new Response(JSON.stringify(RECORDED_TXT_CONFIG), { status: 200 });
        }
        return new Response(JSON.stringify(RECORDED_TXT_PROJECT_DOMAIN), { status: 200 });
      }) as any;

      const result = await addProjectDomain("tok_123", "prj_123", "creator-demo.com");

      expect(result.verified).toBe(false);
      expect(result.sslStatus).toBe("pending");
      expect(result.status).toBe("Pending DNS");
      expect(result.records).toHaveLength(2);
      expect(result.records.some((r) => r.type === "TXT" && r.name === "_vercel.creator-demo.com")).toBe(true);
      expect(result.records.some((r) => r.type === "A" && r.name === "@" && r.value === "76.76.21.21")).toBe(true);
    });

    it("re-reads both verification and config endpoints during 'Check again' (verifyProjectDomain)", async () => {
      let verifyEndpointCalled = false;
      let configEndpointCalled = false;

      global.fetch = vi.fn(async (url: any) => {
        const u = String(url);
        if (u.includes("/verify")) {
          verifyEndpointCalled = true;
          return new Response(JSON.stringify(RECORDED_PROJECT_DOMAIN_FIXTURE), { status: 200 });
        }
        if (u.includes("/v6/domains/")) {
          configEndpointCalled = true;
          return new Response(JSON.stringify(RECORDED_MISCONFIGURED_CONFIG), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      }) as any;

      const result = await verifyProjectDomain("tok_123", "prj_123", "test.creator-demo.com");

      expect(verifyEndpointCalled).toBe(true);
      expect(configEndpointCalled).toBe(true);
      expect(result.status).toBe("Pending DNS");
      expect(result.verified).toBe(false);
    });

    it("parses recommendedIPv4 and verification TXT exactly as returned for an apex domain", () => {
      const RECORDED_APEX_PROJECT_DOMAIN = {
        name: "bloomandpetal.com",
        apexName: "bloomandpetal.com",
        verified: false,
        verification: [
          {
            type: "TXT",
            domain: "_vercel.bloomandpetal.com",
            value: "vc-domain-verify=bloomandpetal.com,a1b2c3d4e5",
            reason: "Verify ownership of apex domain",
          },
        ],
      };

      const RECORDED_APEX_CONFIG_RESPONSE = {
        configuredBy: null,
        misconfigured: true,
        recommendedIPv4: [
          { rank: 1, value: "76.76.21.21" },
        ],
        recommendedCNAME: [],
      };

      const records = computeDnsRecords(RECORDED_APEX_PROJECT_DOMAIN, undefined, RECORDED_APEX_CONFIG_RESPONSE);
      expect(records).toHaveLength(2);
      expect(records).toContainEqual({
        type: "TXT",
        name: "_vercel.bloomandpetal.com",
        value: "vc-domain-verify=bloomandpetal.com,a1b2c3d4e5",
        reason: "Verify ownership of apex domain",
      });
      expect(records).toContainEqual({
        type: "A",
        name: "@",
        value: "76.76.21.21",
        reason: "A record returned by Vercel",
      });
    });

    it("parses recommendedCNAME exactly as returned for a subdomain", () => {
      const RECORDED_SUBDOMAIN_PROJECT_DOMAIN = {
        name: "shop.bloomandpetal.com",
        apexName: "bloomandpetal.com",
        verified: false,
        verification: [],
      };

      const RECORDED_SUBDOMAIN_CONFIG_RESPONSE = {
        configuredBy: null,
        misconfigured: true,
        recommendedIPv4: [],
        recommendedCNAME: [
          { rank: 1, value: "cname.vercel-dns.com" },
        ],
      };

      const records = computeDnsRecords(RECORDED_SUBDOMAIN_PROJECT_DOMAIN, undefined, RECORDED_SUBDOMAIN_CONFIG_RESPONSE);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({
        type: "CNAME",
        name: "shop",
        value: "cname.vercel-dns.com",
        reason: "Subdomain CNAME returned by Vercel",
      });
    });
  });
});

