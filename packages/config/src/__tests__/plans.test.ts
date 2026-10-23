import { describe, it, expect } from "vitest";
import { getPlanConfig, PLAN_CONFIG } from "../plans.js";

describe("Plan Configuration and Limits (Item 6)", () => {
  it("provides correct limits for free plan", () => {
    const config = getPlanConfig("free");
    expect(config.name).toBe("Free");
    expect(config.maxSites).toBe(10);
    expect(config.softDeleteRetentionDays).toBe(30);
    expect(PLAN_CONFIG.free!.maxSites).toBe(10);

    const message = `${config.name} plan: ${config.maxSites} sites. Deleted sites count until they are permanently removed after ${config.softDeleteRetentionDays} days. Upgrade for more sites.`;
    expect(message).toBe(
      "Free plan: 10 sites. Deleted sites count until they are permanently removed after 30 days. Upgrade for more sites."
    );
  });

  it("falls back to free plan when undefined or unrecognized", () => {
    expect(getPlanConfig(undefined).maxSites).toBe(10);
    expect(getPlanConfig("unknown_tier").maxSites).toBe(10);
  });

  it("provides higher limits for pro and enterprise plans", () => {
    expect(getPlanConfig("pro").maxSites).toBe(50);
    expect(getPlanConfig("enterprise").maxSites).toBe(1000);
  });
});
