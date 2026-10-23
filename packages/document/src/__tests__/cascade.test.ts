import { describe, it, expect } from "vitest";
import {
  resolveCascadedProperty,
  resolveElementStyles,
  type StyleRule,
} from "../index.js";

describe("Responsive Breakpoint Cascade", () => {
  const rule: StyleRule = {
    id: "s1",
    kind: "local",
    values: {
      desktop: {
        default: {
          color: { keyword: "black" },
          fontSize: { unit: "px", value: 16 },
          padding: { unit: "px", value: 24 },
        },
        hover: {
          color: { keyword: "blue" },
        },
      },
      tablet: {
        default: {
          fontSize: { unit: "px", value: 14 }, // overrides desktop
        },
      },
      mobile: {
        default: {
          padding: { unit: "px", value: 12 }, // overrides desktop padding
        },
      },
    },
  };

  it("desktop: resolves base values", () => {
    expect(resolveCascadedProperty(rule, "fontSize", "desktop")).toEqual({ unit: "px", value: 16 });
    expect(resolveCascadedProperty(rule, "color", "desktop")).toEqual({ keyword: "black" });
    expect(resolveCascadedProperty(rule, "padding", "desktop")).toEqual({ unit: "px", value: 24 });
  });

  it("tablet: overrides desktop where defined, inherits where unset", () => {
    // Overridden on tablet
    expect(resolveCascadedProperty(rule, "fontSize", "tablet")).toEqual({ unit: "px", value: 14 });
    // Inherited from desktop
    expect(resolveCascadedProperty(rule, "color", "tablet")).toEqual({ keyword: "black" });
    expect(resolveCascadedProperty(rule, "padding", "tablet")).toEqual({ unit: "px", value: 24 });
  });

  it("mobile: walks down mobile -> tablet -> desktop", () => {
    // Overridden on mobile
    expect(resolveCascadedProperty(rule, "padding", "mobile")).toEqual({ unit: "px", value: 12 });
    // Inherited from tablet override
    expect(resolveCascadedProperty(rule, "fontSize", "mobile")).toEqual({ unit: "px", value: 14 });
    // Inherited from desktop base
    expect(resolveCascadedProperty(rule, "color", "mobile")).toEqual({ keyword: "black" });
  });

  it("resolves state inheritance (hover falls back to default if property unset on hover)", () => {
    // Hover defined on desktop:
    expect(resolveCascadedProperty(rule, "color", "desktop", "hover")).toEqual({ keyword: "blue" });
    // fontSize NOT defined on hover: falls back to default fontSize
    expect(resolveCascadedProperty(rule, "fontSize", "desktop", "hover")).toEqual({ unit: "px", value: 16 });
    // on mobile, hover color cascades from desktop hover
    expect(resolveCascadedProperty(rule, "color", "mobile", "hover")).toEqual({ keyword: "blue" });
  });

  it("computes merged declarations for an element across classes and local rules", () => {
    const classRule: StyleRule = {
      id: "c1",
      kind: "class",
      values: {
        desktop: {
          default: {
            display: { keyword: "flex" },
            background: { keyword: "white" },
          },
        },
      },
    };

    const merged = resolveElementStyles([classRule, rule], "mobile", "default");
    expect(merged["display"]).toEqual({ keyword: "flex" }); // from class
    expect(merged["background"]).toEqual({ keyword: "white" }); // from class
    expect(merged["padding"]).toEqual({ unit: "px", value: 12 }); // from local mobile override
    expect(merged["fontSize"]).toEqual({ unit: "px", value: 14 }); // from local tablet override
    expect(merged["color"]).toEqual({ keyword: "black" }); // from local desktop base
  });

  it("free positioning: cascades position, left, and top across desktop -> tablet -> mobile", () => {
    const freePosRule: StyleRule = {
      id: "free-pos-rule",
      kind: "local",
      values: {
        desktop: {
          default: {
            position: { keyword: "absolute" },
            left: { unit: "px", value: 120 },
            top: { unit: "px", value: 80 },
          },
        },
        tablet: {
          default: {
            left: { unit: "px", value: 60 }, // tablet overrides left, top inherited from desktop
          },
        },
        mobile: {
          default: {
            left: { unit: "px", value: 10 }, // mobile overrides left
            top: { unit: "px", value: 20 },  // mobile overrides top
          },
        },
      },
    };

    // Desktop
    expect(resolveCascadedProperty(freePosRule, "position", "desktop")).toEqual({ keyword: "absolute" });
    expect(resolveCascadedProperty(freePosRule, "left", "desktop")).toEqual({ unit: "px", value: 120 });
    expect(resolveCascadedProperty(freePosRule, "top", "desktop")).toEqual({ unit: "px", value: 80 });

    // Tablet: left overridden to 60px, top cascades from desktop (80px), position cascades (absolute)
    expect(resolveCascadedProperty(freePosRule, "position", "tablet")).toEqual({ keyword: "absolute" });
    expect(resolveCascadedProperty(freePosRule, "left", "tablet")).toEqual({ unit: "px", value: 60 });
    expect(resolveCascadedProperty(freePosRule, "top", "tablet")).toEqual({ unit: "px", value: 80 });

    // Mobile: left overridden to 10px, top overridden to 20px, position cascades (absolute)
    expect(resolveCascadedProperty(freePosRule, "position", "mobile")).toEqual({ keyword: "absolute" });
    expect(resolveCascadedProperty(freePosRule, "left", "mobile")).toEqual({ unit: "px", value: 10 });
    expect(resolveCascadedProperty(freePosRule, "top", "mobile")).toEqual({ unit: "px", value: 20 });
  });
});
