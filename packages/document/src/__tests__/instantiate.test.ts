import { describe, it, expect } from "vitest";
import { createYDoc, yDocToSiteDocument } from "../yjs/index.js";
import { instantiateTemplateDocument } from "../templates/instantiate.js";
import { insertElement } from "../commands/index.js";
import { validateSiteDocument } from "../validator/index.js";

describe("Template Instantiation", () => {
  it("deeply clones and assigns brand new unique IDs for elements, styles, and pages", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    // Insert a child element
    insertElement(yDoc, {
      parentId: bodyId,
      element: {
        type: "Heading",
        name: "Heading 1",
        props: { text: "Hello World", level: "h1" },
        origin: "template",
      },
    });

    const populatedDoc = yDocToSiteDocument(yDoc);
    const oldElementIds = new Set(Object.keys(populatedDoc.elements));
    const oldStyleIds = new Set(Object.keys(populatedDoc.styles));
    const oldPageIds = new Set(Object.keys(populatedDoc.pages));

    const newDoc = instantiateTemplateDocument(populatedDoc, {
      siteName: "My Cloned Site",
      brandTokens: {
        colors: {
          primary: "#10b981",
          secondary: "#047857",
        },
      },
    });

    // 1. Structure is valid
    const validation = validateSiteDocument(newDoc);
    expect(validation.valid).toBe(true);

    // 2. Site name and tokens updated
    expect(newDoc.site.name).toBe("My Cloned Site");
    expect(newDoc.tokens.colors.primary).toBe("#10b981");

    // 3. Entity counts are identical
    expect(Object.keys(newDoc.elements).length).toBe(oldElementIds.size);
    expect(Object.keys(newDoc.styles).length).toBe(oldStyleIds.size);
    expect(Object.keys(newDoc.pages).length).toBe(oldPageIds.size);

    // 4. Zero ID overlap with original
    for (const newElId of Object.keys(newDoc.elements)) {
      expect(oldElementIds.has(newElId)).toBe(false);
    }
    for (const newStyleId of Object.keys(newDoc.styles)) {
      expect(oldStyleIds.has(newStyleId)).toBe(false);
    }
    for (const newPageId of Object.keys(newDoc.pages)) {
      expect(oldPageIds.has(newPageId)).toBe(false);
    }

    // 5. Parent-child relationships properly mapped
    const newPage = Object.values(newDoc.pages)[0]!;
    const newBody = newDoc.elements[newPage.rootId]!;
    expect(newBody).toBeDefined();
    expect(newBody.parentId).toBeNull();
    expect(newBody.children.length).toBe(1);

    const newChildId = newBody.children[0]!;
    const newChild = newDoc.elements[newChildId]!;
    expect(newChild.parentId).toBe(newBody.id);
    expect(newChild.origin).toBe("template");
  });
});
