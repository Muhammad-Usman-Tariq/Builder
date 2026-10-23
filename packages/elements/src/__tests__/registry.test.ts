import { describe, it, expect } from "vitest";
import {
  ELEMENT_REGISTRY,
  getElementDefinition,
  getAllElementDefinitions,
  validateElementNesting,
} from "../index.js";

const EXPECTED_PRIMITIVES = [
  "Body",
  "Section",
  "Box",
  "Container",
  "Heading",
  "Text",
  "RichText",
  "Image",
  "Link",
  "Button",
  "Icon",
  "Navbar",
  "Form",
  "Input",
  "Textarea",
  "Submit",
  "CmsList",
  "CmsField",
];

describe("Element Registry", () => {
  it("contains all prototype and CMS primitives", () => {
    const registeredKeys = Object.keys(ELEMENT_REGISTRY);
    for (const type of EXPECTED_PRIMITIVES) {
      expect(registeredKeys).toContain(type);
      const def = getElementDefinition(type);
      expect(def).toBeDefined();
      expect(def?.type).toBe(type);
      expect(typeof def?.render).toBe("function");
      expect(def?.propsSchema).toBeDefined();
      expect(def?.defaultProps).toBeDefined();
      expect(def?.defaultStyle).toBeDefined();
    }
  });

  it("getAllElementDefinitions returns all definitions", () => {
    const all = getAllElementDefinitions();
    expect(all.length).toBeGreaterThanOrEqual(18);
  });

  it("validateElementNesting enforces nesting rules", () => {
    // Form nesting
    expect(validateElementNesting("Form", "Input")).toBe(true);
    expect(validateElementNesting("Form", "Textarea")).toBe(true);
    expect(validateElementNesting("Form", "Submit")).toBe(true);

    // Box nesting
    expect(validateElementNesting("Box", "Heading")).toBe(true);
    expect(validateElementNesting("Box", "Button")).toBe(true);

    // Leaf elements cannot have children
    expect(validateElementNesting("Heading", "Text")).toBe(false);
    expect(validateElementNesting("Button", "Icon")).toBe(false);
    expect(validateElementNesting("Input", "Text")).toBe(false);

    // Allowed parents
    expect(validateElementNesting("Heading", "Input")).toBe(false);
    expect(validateElementNesting("Body", "Input")).toBe(false); // Input needs form/box/container/section
  });
});
