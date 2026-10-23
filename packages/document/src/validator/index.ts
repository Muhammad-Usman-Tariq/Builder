import { siteDocumentSchema } from "../schema/index.js";
import { KNOWN_ELEMENT_TYPES, type SiteDocument } from "../types/index.js";

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export class DocumentValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = "DocumentValidationError";
    this.errors = errors;
  }
}

/**
 * Validates a site document completely: Zod structure + tree integrity (no broken links,
 * no orphans, no cycles, unique IDs, valid root elements, known types).
 */
export function validateSiteDocument(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Zod schema validation
  const zodResult = siteDocumentSchema.safeParse(data);
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      errors.push({
        path: issue.path.join("."),
        message: issue.message,
        code: `SCHEMA_${issue.code.toUpperCase()}`,
      });
    }
    return { valid: false, errors };
  }

  const doc = zodResult.data as SiteDocument;

  // 2. ID collisions across collections
  const seenIds = new Map<string, string>();
  const checkUniqueId = (id: string, collection: string) => {
    if (seenIds.has(id)) {
      errors.push({
        path: `${collection}.${id}`,
        message: `ID "${id}" is duplicated across collections (found in ${seenIds.get(id)} and ${collection}).`,
        code: "DUPLICATE_ID",
      });
    } else {
      seenIds.set(id, collection);
    }
  };

  for (const id of Object.keys(doc.pages)) checkUniqueId(id, "pages");
  for (const id of Object.keys(doc.elements)) checkUniqueId(id, "elements");
  for (const id of Object.keys(doc.styles)) checkUniqueId(id, "styles");
  for (const id of Object.keys(doc.components)) checkUniqueId(id, "components");
  for (const id of Object.keys(doc.assets)) checkUniqueId(id, "assets");

  // 3. Validate pages and root elements
  const reachableElements = new Set<string>();

  for (const [pageId, page] of Object.entries(doc.pages)) {
    const root = doc.elements[page.rootId];
    if (!root) {
      errors.push({
        path: `pages.${pageId}.rootId`,
        message: `Page "${page.name}" (${pageId}) references missing root element "${page.rootId}".`,
        code: "MISSING_ROOT_ELEMENT",
      });
      continue;
    }

    if (root.parentId !== null) {
      errors.push({
        path: `elements.${root.id}.parentId`,
        message: `Root element "${root.id}" for page "${pageId}" must have parentId === null.`,
        code: "INVALID_ROOT_PARENT",
      });
    }

    if (root.type !== "Body") {
      errors.push({
        path: `elements.${root.id}.type`,
        message: `Root element "${root.id}" for page "${pageId}" must be of type "Body" (got "${root.type}").`,
        code: "INVALID_ROOT_TYPE",
      });
    }
  }

  // 4. Element parent-child links, known types, and cycle detection
  const elementIds = new Set(Object.keys(doc.elements));

  for (const [elId, el] of Object.entries(doc.elements)) {
    // Known element types check
    if (!KNOWN_ELEMENT_TYPES.includes(el.type as any)) {
      errors.push({
        path: `elements.${elId}.type`,
        message: `Unknown element type "${el.type}" on element "${elId}".`,
        code: "UNKNOWN_ELEMENT_TYPE",
      });
    }

    // Style references check
    for (const styleId of el.styleIds) {
      if (!doc.styles[styleId]) {
        errors.push({
          path: `elements.${elId}.styleIds`,
          message: `Element "${elId}" references non-existent style "${styleId}".`,
          code: "MISSING_STYLE_REF",
        });
      }
    }

    // Component instance check
    if (el.instanceOf && !doc.components[el.instanceOf.componentId]) {
      errors.push({
        path: `elements.${elId}.instanceOf`,
        message: `Element "${elId}" references non-existent component "${el.instanceOf.componentId}".`,
        code: "MISSING_COMPONENT_REF",
      });
    }

    // Parent link check
    if (el.parentId !== null) {
      const parent = doc.elements[el.parentId];
      if (!parent) {
        errors.push({
          path: `elements.${elId}.parentId`,
          message: `Element "${elId}" references missing parent "${el.parentId}".`,
          code: "BROKEN_PARENT_LINK",
        });
      } else if (!parent.children.includes(elId)) {
        errors.push({
          path: `elements.${parent.id}.children`,
          message: `Parent "${parent.id}" does not list child "${elId}" in its children array.`,
          code: "PARENT_CHILD_MISMATCH",
        });
      }
    }

    // Children link check
    const seenChildIds = new Set<string>();
    for (const childId of el.children) {
      if (seenChildIds.has(childId)) {
        errors.push({
          path: `elements.${elId}.children`,
          message: `Duplicate child ID "${childId}" in parent "${elId}" children array.`,
          code: "DUPLICATE_CHILD_ENTRY",
        });
      }
      seenChildIds.add(childId);

      const child = doc.elements[childId];
      if (!child) {
        errors.push({
          path: `elements.${elId}.children`,
          message: `Parent "${elId}" lists missing child "${childId}".`,
          code: "BROKEN_CHILD_LINK",
        });
      } else if (child.parentId !== elId) {
        errors.push({
          path: `elements.${childId}.parentId`,
          message: `Child "${childId}" has parentId "${child.parentId}", but parent "${elId}" lists it in children.`,
          code: "PARENT_CHILD_MISMATCH",
        });
      }
    }
  }

  // 5. Cycle detection and Reachability (No Orphans)
  // Walk from each page's rootId
  for (const page of Object.values(doc.pages)) {
    if (!doc.elements[page.rootId]) continue;

    const stack: { id: string; path: string[] }[] = [{ id: page.rootId, path: [page.rootId] }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      reachableElements.add(current.id);

      const el = doc.elements[current.id];
      if (!el) continue;

      for (const childId of el.children) {
        if (current.path.includes(childId)) {
          errors.push({
            path: `elements.${childId}`,
            message: `Cyclic dependency detected: ${current.path.join(" -> ")} -> ${childId}`,
            code: "CYCLIC_TREE_STRUCTURE",
          });
          continue;
        }

        if (elementIds.has(childId)) {
          stack.push({ id: childId, path: [...current.path, childId] });
        }
      }
    }
  }

  // Check elements for orphans
  for (const elId of elementIds) {
    if (!reachableElements.has(elId)) {
      errors.push({
        path: `elements.${elId}`,
        message: `Orphaned element "${elId}" is not reachable from any page root element.`,
        code: "ORPHANED_ELEMENT",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts document validity or throws DocumentValidationError.
 */
export function assertValidSiteDocument(data: unknown): asserts data is SiteDocument {
  const result = validateSiteDocument(data);
  if (!result.valid) {
    const errorDetails = result.errors.map((e) => `  [${e.code}] ${e.path}: ${e.message}`).join("\n");
    throw new DocumentValidationError(
      `Site document validation failed with ${result.errors.length} error(s):\n${errorDetails}`,
      result.errors
    );
  }
}
