import { describe, it, expect } from "vitest";
import { hasMinRole } from "../roles.js";

describe("Workspace Roles & Permissions", () => {
  it("enforces hierarchy: OWNER > ADMIN > MEMBER > VIEWER", () => {
    // OWNER can do anything
    expect(hasMinRole("OWNER", "OWNER")).toBe(true);
    expect(hasMinRole("OWNER", "ADMIN")).toBe(true);
    expect(hasMinRole("OWNER", "MEMBER")).toBe(true);
    expect(hasMinRole("OWNER", "VIEWER")).toBe(true);

    // ADMIN can do ADMIN, MEMBER, VIEWER, but not OWNER actions
    expect(hasMinRole("ADMIN", "OWNER")).toBe(false);
    expect(hasMinRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasMinRole("ADMIN", "MEMBER")).toBe(true);
    expect(hasMinRole("ADMIN", "VIEWER")).toBe(true);

    // MEMBER can do MEMBER and VIEWER
    expect(hasMinRole("MEMBER", "OWNER")).toBe(false);
    expect(hasMinRole("MEMBER", "ADMIN")).toBe(false);
    expect(hasMinRole("MEMBER", "MEMBER")).toBe(true);
    expect(hasMinRole("MEMBER", "VIEWER")).toBe(true);

    // VIEWER can only do VIEWER
    expect(hasMinRole("VIEWER", "OWNER")).toBe(false);
    expect(hasMinRole("VIEWER", "ADMIN")).toBe(false);
    expect(hasMinRole("VIEWER", "MEMBER")).toBe(false);
    expect(hasMinRole("VIEWER", "VIEWER")).toBe(true);

    // Unknown or null role has no permissions
    expect(hasMinRole(null, "VIEWER")).toBe(false);
    expect(hasMinRole(undefined, "VIEWER")).toBe(false);
    expect(hasMinRole("GUEST", "VIEWER")).toBe(false);
  });
});
