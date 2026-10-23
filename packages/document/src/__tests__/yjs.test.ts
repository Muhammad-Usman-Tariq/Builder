import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import {
  createBlankDocument,
  siteDocumentToYDoc,
  yDocToSiteDocument,
  encodeYDocState,
  applyYDocUpdate,
  mergeYDocUpdates,
  createYDocFromState,
  insertElement,
} from "../index.js";

describe("Yjs State Persistence & Binary Operations", () => {
  it("encodes, merges, and restores Yjs state accurately", () => {
    // 1. Initial document
    const doc = createBlankDocument("Test Site");
    const yDoc1 = siteDocumentToYDoc(doc);
    const initialBinary = encodeYDocState(yDoc1);

    expect(initialBinary).toBeInstanceOf(Uint8Array);
    expect(initialBinary.length).toBeGreaterThan(0);

    // 2. Perform an edit on yDoc1
    const bodyId = Object.values(doc.elements).find((e) => e.type === "Body")!.id;
    insertElement(yDoc1, {
      parentId: bodyId,
      element: { type: "Section", name: "New Section" },
    });

    const updatedDoc = yDocToSiteDocument(yDoc1);
    const fullBinary = encodeYDocState(yDoc1);

    // 3. Rehydrate from binary state
    const yDoc2 = createYDocFromState(fullBinary);
    const rehydratedDoc = yDocToSiteDocument(yDoc2);

    expect(rehydratedDoc.site.name).toBe("Test Site");
    expect(Object.keys(rehydratedDoc.elements).length).toBe(
      Object.keys(updatedDoc.elements).length
    );

    // 4. Test merging two updates
    const merged = mergeYDocUpdates([initialBinary, fullBinary]);
    const yDoc3 = createYDocFromState(merged);
    const mergedDoc = yDocToSiteDocument(yDoc3);

    expect(mergedDoc.site.name).toBe("Test Site");
    expect(Object.keys(mergedDoc.elements).length).toBe(
      Object.keys(updatedDoc.elements).length
    );

    // 5. Test applyYDocUpdate directly on an empty Y.Doc
    const yDoc4 = new Y.Doc();
    applyYDocUpdate(yDoc4, fullBinary);
    const appliedDoc = yDocToSiteDocument(yDoc4);
    expect(appliedDoc.site.name).toBe("Test Site");
    expect(Object.keys(appliedDoc.elements).length).toBe(
      Object.keys(updatedDoc.elements).length
    );
  });
});
