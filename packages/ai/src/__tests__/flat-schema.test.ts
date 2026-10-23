import { describe, it, expect, vi } from "vitest";
import { asSchema } from "ai";
import { AiFlatSectionSchema } from "../schema/ai-tree.js";
import { rebuildTreeFromFlatNodes } from "../compiler/index.js";

describe("B.1 AI Flat Schema & Compiler Reconstruction", () => {
  it("converts flat section schema without any recursion warnings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Call asSchema which triggers zod-to-json-schema conversion
    const schemaObj = asSchema(AiFlatSectionSchema);
    expect(schemaObj).toBeDefined();
    expect(schemaObj.jsonSchema).toBeDefined();

    // Verify no warnings were logged during conversion
    const recursionWarnings = warnSpy.mock.calls.filter((call) =>
      call.some((arg) => typeof arg === "string" && arg.toLowerCase().includes("recursive"))
    );
    expect(recursionWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it("rebuilds hierarchical AiNode tree from valid flat nodes", () => {
    const flatNodes = [
      {
        id: "sec_root",
        parentId: null,
        type: "Section" as const,
        props: { name: "Hero Section" },
        style: { padding: "40px" },
      },
      {
        id: "box_1",
        parentId: "sec_root",
        type: "Box" as const,
        props: {},
        style: { gap: "16px" },
      },
      {
        id: "heading_1",
        parentId: "box_1",
        type: "Heading" as const,
        props: { text: "Welcome to our store", level: 1 },
      },
      {
        id: "btn_1",
        parentId: "box_1",
        type: "Button" as const,
        props: { text: "Shop Now", href: "/shop" },
      },
    ];

    const tree = rebuildTreeFromFlatNodes(flatNodes);
    expect(tree.type).toBe("Section");
    expect(tree.children).toHaveLength(1);

    const box = tree.children![0]!;
    expect(box.type).toBe("Box");
    expect(box.children).toHaveLength(2);

    expect(box.children![0]!.type).toBe("Heading");
    expect(box.children![0]!.text).toBe("Welcome to our store");
    expect(box.children![0]!.level).toBe(1);

    expect(box.children![1]!.type).toBe("Button");
    expect(box.children![1]!.text).toBe("Shop Now");
  });

  it("fails when duplicate node IDs exist", () => {
    const duplicateNodes = [
      { id: "dup_id", parentId: null, type: "Section" as const, props: {} },
      { id: "dup_id", parentId: "dup_id", type: "Box" as const, props: {} },
    ];
    expect(() => rebuildTreeFromFlatNodes(duplicateNodes)).toThrow(/Duplicate node ID/);
  });

  it("fails when a node references a non-existent parent", () => {
    const orphanNodes = [
      { id: "sec_root", parentId: null, type: "Section" as const, props: {} },
      { id: "box_1", parentId: "non_existent_parent", type: "Box" as const, props: {} },
    ];
    expect(() => rebuildTreeFromFlatNodes(orphanNodes)).toThrow(/non-existent parent/);
  });

  it("fails when a cycle exists in the tree", () => {
    const cyclicNodes = [
      { id: "node_a", parentId: null, type: "Section" as const, props: {} },
      { id: "node_b", parentId: "node_c", type: "Box" as const, props: {} },
      { id: "node_c", parentId: "node_b", type: "Box" as const, props: {} },
    ];
    // node_b -> node_c -> node_b
    expect(() => rebuildTreeFromFlatNodes(cyclicNodes)).toThrow(/Cycle detected/);
  });
});
