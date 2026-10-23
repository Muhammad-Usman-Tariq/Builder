import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createYDoc,
  createBlankDocument,
  yDocToSiteDocument,
  insertElement,
} from "@builder/document";
import { CanvasElement } from "../index.js";
import { renderPageToStaticMarkup } from "../server/staticMarkup.js";

describe("Shared Renderer (Canvas and Static Markup)", () => {
  it("produces identical HTML tags across primitives and matches snapshot", () => {
    const yDoc = createYDoc(createBlankDocument("Coffee Shop"));
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;
    const pageId = Object.keys(doc.pages)[0]!;

    // 1. Add Navbar
    insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Navbar", props: { brandText: "Artisan Coffee" } },
    });

    // 2. Add Section with Heading, Text, Button
    const heroId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Section" },
    });
    insertElement(yDoc, {
      parentId: heroId,
      element: { type: "Heading", props: { text: "Fresh Morning Roast", level: 1 } },
    });
    insertElement(yDoc, {
      parentId: heroId,
      element: { type: "Text", props: { text: "Locally sourced beans roasted daily." } },
    });
    insertElement(yDoc, {
      parentId: heroId,
      element: { type: "Button", props: { text: "Order Now", variant: "primary" } },
    });

    // 3. Add Form with Input, Textarea, Submit
    const formId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Form", props: { formId: "contact" } },
    });
    insertElement(yDoc, {
      parentId: formId,
      element: { type: "Input", props: { name: "email", type: "email", label: "Email Address", required: true } },
    });
    insertElement(yDoc, {
      parentId: formId,
      element: { type: "Textarea", props: { name: "inquiry", label: "Message", rows: 3 } },
    });
    insertElement(yDoc, {
      parentId: formId,
      element: { type: "Submit", props: { text: "Send Message" } },
    });

    const populatedDoc = yDocToSiteDocument(yDoc);
    const { html, css, title } = renderPageToStaticMarkup(populatedDoc, pageId);

    expect(title).toBe("Coffee Shop");

    // HTML assertions
    expect(html).toContain('<body id="');
    expect(html).toContain('data-element-type="Navbar"');
    expect(html).toContain("Artisan Coffee");
    expect(html).toContain("<h1");
    expect(html).toContain("Fresh Morning Roast</h1>");
    expect(html).toContain("Locally sourced beans roasted daily.</p>");
    expect(html).toContain("Order Now</button>");
    expect(html).toContain('<form id="');
    expect(html).toContain('data-element-type="Form"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="inquiry"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Send Message</button>");

    // CSS assertions
    expect(css).toContain(":root {");
    expect(css).toContain("--color-primary:");

    // Deterministic snapshot
    const normalizedHtml = html
      .replace(/el-[a-zA-Z0-9_-]+/g, "el-id")
      .replace(/style-[a-zA-Z0-9_-]+/g, "style-id");
    expect(normalizedHtml).toMatchSnapshot();
  });

  it("attaches is-selected class when rendering in editor mode", () => {
    const yDoc = createYDoc();
    const doc = yDocToSiteDocument(yDoc);
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;

    const btnId = insertElement(yDoc, {
      parentId: bodyId,
      element: { type: "Button", props: { text: "Test" } },
    });

    const updatedDoc = yDocToSiteDocument(yDoc);

    const editorHtml = renderToStaticMarkup(
      React.createElement(CanvasElement, {
        doc: updatedDoc,
        elementId: btnId,
        isEditor: true,
        selectedId: btnId,
      })
    );

    expect(editorHtml).toContain("is-selected");

    const nonSelectedHtml = renderToStaticMarkup(
      React.createElement(CanvasElement, {
        doc: updatedDoc,
        elementId: btnId,
        isEditor: true,
        selectedId: "other-id",
      })
    );

    expect(nonSelectedHtml).not.toContain("is-selected");
  });
});
