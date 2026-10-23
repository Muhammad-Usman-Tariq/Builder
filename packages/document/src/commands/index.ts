import * as Y from "yjs";
import { nanoid } from "nanoid";
import type {
  CSSDeclarations,
  ComponentDef,
  Element,
  Page,
  PageSeo,
  PropValue,
  StyleRule,
  StyleState,
  StyleValue,
  SiteDocument,
} from "../types/index.js";
import {
  clipboardPayloadSchema,
  type ClipboardPayload,
} from "../schema/index.js";

export interface InsertElementOptions {
  parentId: string;
  index?: number | undefined;
  element: {
    id?: string | undefined;
    type: string;
    name?: string | undefined;
    props?: Record<string, PropValue> | undefined;
    styleIds?: string[] | undefined;
    hidden?: boolean | undefined;
    locked?: boolean | undefined;
    origin?: Element["origin"] | undefined;
    aiLocked?: boolean | undefined;
    children?: string[] | undefined;
  };
  style?: (Omit<StyleRule, "id"> & { id?: string | undefined }) | undefined;
}

export interface MoveElementOptions {
  elementId: string;
  newParentId: string;
  index?: number | undefined;
}

export interface DeleteElementOptions {
  elementId: string;
}

export interface DuplicateElementOptions {
  elementId: string;
}

export interface SetPropOptions {
  elementId: string;
  propName: string;
  value: PropValue;
}

export interface SetStyleOptions {
  styleId: string;
  breakpoint: string;
  state?: StyleState;
  property: string;
  value: StyleValue;
}

export interface ResetStyleOptions {
  styleId: string;
  breakpoint: string;
  state?: StyleState;
  property: string;
}

export interface GroupElementsOptions {
  elementIds: string[];
  groupType?: string;
  name?: string;
}

export interface UngroupElementsOptions {
  containerId: string;
}

export interface WrapInBoxOptions {
  elementId: string;
}

export interface CreateComponentOptions {
  elementId: string;
  name: string;
}

export interface DetachInstanceOptions {
  elementId: string;
}

export interface AddPageOptions {
  name: string;
  slug: string;
  seo?: PageSeo;
}

export interface UpdatePageOptions {
  pageId: string;
  updates: Partial<Omit<Page, "id" | "rootId">>;
}

export interface DeletePageOptions {
  pageId: string;
}

export interface SetTokenOptions {
  category: "colors" | "fonts" | "spacing" | "radius" | "shadows";
  key: string;
  value: any;
}

export interface ApplyAiPatchOptions {
  elements?: Record<string, Partial<Element>>;
  styles?: Record<string, { breakpoint: string; state?: StyleState; declarations: CSSDeclarations }>;
  origin?: "ai" | "user" | "template";
}

/**
 * 1. insertElement: Adds a new element to parent with optional local style.
 */
export function insertElement(yDoc: Y.Doc, options: InsertElementOptions, origin = "user"): string {
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  const parent = yElements.get(options.parentId) as Element | undefined;
  if (!parent) {
    throw new Error(`Cannot insert element: parent "${options.parentId}" not found.`);
  }

  const elId = options.element.id || `el-${nanoid(8)}`;
  let styleId: string | undefined;

  yDoc.transact(() => {
    const styleIds = [...(options.element.styleIds || [])];

    if (options.style) {
      styleId = options.style.id || `style-${nanoid(8)}`;
      const newStyle: StyleRule = {
        id: styleId,
        kind: options.style.kind || "local",
        name: options.style.name,
        values: options.style.values || {},
      };
      yStyles.set(styleId, newStyle);
      if (!styleIds.includes(styleId)) {
        styleIds.push(styleId);
      }
    }

    const newElement: Element = {
      id: elId,
      type: options.element.type,
      name: options.element.name || options.element.type,
      parentId: options.parentId,
      children: options.element.children || [],
      props: options.element.props || {},
      styleIds,
      hidden: options.element.hidden,
      locked: options.element.locked,
      origin: options.element.origin || (origin as any),
      aiLocked: options.element.aiLocked,
    };

    yElements.set(elId, newElement);

    const children = [...parent.children];
    const targetIdx = options.index !== undefined && options.index >= 0 ? options.index : children.length;
    children.splice(targetIdx, 0, elId);

    yElements.set(options.parentId, {
      ...parent,
      children,
    });
  }, origin);

  return elId;
}

/**
 * 2. moveElement: Repositions an element under a new parent or new index.
 */
export function moveElement(yDoc: Y.Doc, options: MoveElementOptions, origin = "user"): void {
  const yElements = yDoc.getMap("elements");

  const el = yElements.get(options.elementId) as Element | undefined;
  if (!el) throw new Error(`Element "${options.elementId}" not found.`);
  if (el.parentId === null) throw new Error(`Cannot move root element "${options.elementId}".`);

  const oldParent = yElements.get(el.parentId) as Element | undefined;
  if (!oldParent) throw new Error(`Old parent "${el.parentId}" not found.`);

  const newParent = yElements.get(options.newParentId) as Element | undefined;
  if (!newParent) throw new Error(`New parent "${options.newParentId}" not found.`);

  // Cycle check: newParent cannot be el or descendant of el
  let current: Element | undefined = newParent;
  while (current) {
    if (current.id === el.id) {
      throw new Error(`Cannot move element into itself or one of its descendants.`);
    }
    current = current.parentId ? (yElements.get(current.parentId) as Element | undefined) : undefined;
  }

  yDoc.transact(() => {
    // Remove from old parent
    const oldChildren = oldParent.children.filter((id) => id !== el.id);
    yElements.set(oldParent.id, { ...oldParent, children: oldChildren });

    // Insert into new parent
    const newChildren = oldParent.id === newParent.id ? oldChildren : [...newParent.children];
    const targetIdx = options.index !== undefined && options.index >= 0 ? options.index : newChildren.length;
    newChildren.splice(targetIdx, 0, el.id);

    yElements.set(newParent.id, { ...newParent, children: newChildren });
    yElements.set(el.id, { ...el, parentId: options.newParentId });
  }, origin);
}

/**
 * 3. deleteElement: Recursively deletes element and all its descendants and local styles.
 */
export function deleteElement(yDoc: Y.Doc, options: DeleteElementOptions, origin = "user"): void {
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  const el = yElements.get(options.elementId) as Element | undefined;
  if (!el) return;
  if (el.parentId === null) {
    throw new Error(`Cannot delete page root element "${options.elementId}".`);
  }

  const parent = yElements.get(el.parentId) as Element | undefined;

  yDoc.transact(() => {
    if (parent) {
      const children = parent.children.filter((id) => id !== el.id);
      yElements.set(parent.id, { ...parent, children });
    }

    const deleteSubtree = (targetId: string) => {
      const target = yElements.get(targetId) as Element | undefined;
      if (!target) return;

      for (const childId of target.children) {
        deleteSubtree(childId);
      }

      // Remove local styles
      for (const styleId of target.styleIds) {
        const style = yStyles.get(styleId) as StyleRule | undefined;
        if (style && style.kind === "local") {
          yStyles.delete(styleId);
        }
      }

      yElements.delete(targetId);
    };

    deleteSubtree(el.id);
  }, origin);
}

/**
 * 4. duplicateElement: Deep clones element, descendants, and styles with fresh IDs.
 */
export function duplicateElement(yDoc: Y.Doc, options: DuplicateElementOptions, origin = "user"): string {
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  const original = yElements.get(options.elementId) as Element | undefined;
  if (!original) throw new Error(`Element "${options.elementId}" not found.`);
  if (original.parentId === null) throw new Error("Cannot duplicate page root element.");

  const parent = yElements.get(original.parentId) as Element | undefined;
  if (!parent) throw new Error("Parent not found.");

  let newRootId = "";

  yDoc.transact(() => {
    const cloneSubtree = (sourceId: string, newParentId: string | null): string => {
      const source = yElements.get(sourceId) as Element;
      const freshId = `el-${nanoid(8)}`;
      if (!newRootId) newRootId = freshId;

      // Duplicate local styles
      const newStyleIds: string[] = [];
      for (const styleId of source.styleIds) {
        const style = yStyles.get(styleId) as StyleRule | undefined;
        if (style && style.kind === "local") {
          const freshStyleId = `style-${nanoid(8)}`;
          yStyles.set(freshStyleId, {
            ...style,
            id: freshStyleId,
            values: JSON.parse(JSON.stringify(style.values)),
          });
          newStyleIds.push(freshStyleId);
        } else {
          newStyleIds.push(styleId); // Shared class preserved
        }
      }

      const clonedChildren: string[] = [];
      for (const childId of source.children) {
        clonedChildren.push(cloneSubtree(childId, freshId));
      }

      const clonedElement: Element = {
        ...JSON.parse(JSON.stringify(source)),
        id: freshId,
        parentId: newParentId,
        children: clonedChildren,
        styleIds: newStyleIds,
      };

      yElements.set(freshId, clonedElement);
      return freshId;
    };

    const createdId = cloneSubtree(original.id, original.parentId);

    // Insert after original element
    const children = [...parent.children];
    const origIdx = children.indexOf(original.id);
    children.splice(origIdx + 1, 0, createdId);
    yElements.set(parent.id, { ...parent, children });
  }, origin);

  return newRootId;
}

/**
 * 5. setProp: Updates a property on an element.
 */
export function setProp(yDoc: Y.Doc, options: SetPropOptions, origin = "user"): void {
  const yElements = yDoc.getMap("elements");
  const el = yElements.get(options.elementId) as Element | undefined;
  if (!el) throw new Error(`Element "${options.elementId}" not found.`);

  yDoc.transact(() => {
    yElements.set(options.elementId, {
      ...el,
      props: {
        ...el.props,
        [options.propName]: options.value,
      },
    });
  }, origin);
}

/**
 * 6. setStyle: Updates a CSS declaration inside a style rule.
 */
export function setStyle(yDoc: Y.Doc, options: SetStyleOptions, origin = "user"): void {
  const yStyles = yDoc.getMap("styles");
  const style = yStyles.get(options.styleId) as StyleRule | undefined;
  if (!style) throw new Error(`Style "${options.styleId}" not found.`);

  const state = options.state || "default";

  yDoc.transact(() => {
    const updatedValues = JSON.parse(JSON.stringify(style.values || {}));
    if (!updatedValues[options.breakpoint]) {
      updatedValues[options.breakpoint] = {};
    }
    if (!updatedValues[options.breakpoint][state]) {
      updatedValues[options.breakpoint][state] = {};
    }

    updatedValues[options.breakpoint][state][options.property] = options.value;

    yStyles.set(options.styleId, {
      ...style,
      values: updatedValues,
    });
  }, origin);
}

/**
 * 7. resetStyle: Clears a CSS declaration from a style rule.
 */
export function resetStyle(yDoc: Y.Doc, options: ResetStyleOptions, origin = "user"): void {
  const yStyles = yDoc.getMap("styles");
  const style = yStyles.get(options.styleId) as StyleRule | undefined;
  if (!style) return;

  const state = options.state || "default";

  yDoc.transact(() => {
    const updatedValues = JSON.parse(JSON.stringify(style.values || {}));
    if (updatedValues[options.breakpoint]?.[state]) {
      delete updatedValues[options.breakpoint][state][options.property];
      yStyles.set(options.styleId, {
        ...style,
        values: updatedValues,
      });
    }
  }, origin);
}

/**
 * 8. groupElements: Groups siblings into a new Box or Container.
 */
export function groupElements(yDoc: Y.Doc, options: GroupElementsOptions, origin = "user"): string {
  if (options.elementIds.length === 0) throw new Error("No elements specified to group.");

  const yElements = yDoc.getMap("elements");
  const firstEl = yElements.get(options.elementIds[0]!) as Element | undefined;
  if (!firstEl) throw new Error(`Element "${options.elementIds[0]}" not found.`);
  if (firstEl.parentId === null) throw new Error("Cannot group root element.");

  const parentId = firstEl.parentId;
  const parent = yElements.get(parentId) as Element | undefined;
  if (!parent) throw new Error("Parent element not found.");

  for (const id of options.elementIds) {
    const el = yElements.get(id) as Element | undefined;
    if (!el || el.parentId !== parentId) {
      throw new Error(`All grouped elements must be siblings under "${parentId}".`);
    }
  }

  const containerId = `el-box-${nanoid(8)}`;

  yDoc.transact(() => {
    const container: Element = {
      id: containerId,
      type: options.groupType || "Box",
      name: options.name || options.groupType || "Box",
      parentId,
      children: [...options.elementIds],
      props: {},
      styleIds: [],
    };
    yElements.set(containerId, container);

    for (const childId of options.elementIds) {
      const child = yElements.get(childId) as Element;
      yElements.set(childId, { ...child, parentId: containerId });
    }

    const firstIndex = parent.children.indexOf(options.elementIds[0]!);
    const remainingChildren = parent.children.filter((id) => !options.elementIds.includes(id));
    remainingChildren.splice(firstIndex, 0, containerId);

    yElements.set(parentId, { ...parent, children: remainingChildren });
  }, origin);

  return containerId;
}

/**
 * 9. ungroupElements: Dissolves a container, promoting its children to its parent.
 */
export function ungroupElements(yDoc: Y.Doc, options: UngroupElementsOptions, origin = "user"): void {
  const yElements = yDoc.getMap("elements");
  const container = yElements.get(options.containerId) as Element | undefined;
  if (!container) throw new Error(`Container "${options.containerId}" not found.`);
  if (container.parentId === null) throw new Error("Cannot ungroup root element.");

  const parent = yElements.get(container.parentId) as Element | undefined;
  if (!parent) throw new Error("Parent not found.");

  yDoc.transact(() => {
    const containerIdx = parent.children.indexOf(container.id);
    const newChildren = [...parent.children];
    newChildren.splice(containerIdx, 1, ...container.children);

    for (const childId of container.children) {
      const child = yElements.get(childId) as Element;
      yElements.set(childId, { ...child, parentId: parent.id });
    }

    yElements.set(parent.id, { ...parent, children: newChildren });
    yElements.delete(container.id);
  }, origin);
}

/**
 * 10. wrapInBox: Wraps a single element inside a new Box parent.
 */
export function wrapInBox(yDoc: Y.Doc, options: WrapInBoxOptions, origin = "user"): string {
  return groupElements(
    yDoc,
    {
      elementIds: [options.elementId],
      groupType: "Box",
      name: "Box",
    },
    origin
  );
}

/**
 * 11. createComponent: Saves an element subtree as a reusable ComponentDef.
 */
export function createComponent(yDoc: Y.Doc, options: CreateComponentOptions, origin = "user"): string {
  const yElements = yDoc.getMap("elements");
  const yComponents = yDoc.getMap("components");

  const root = yElements.get(options.elementId) as Element | undefined;
  if (!root) throw new Error(`Element "${options.elementId}" not found.`);

  const compId = `comp-${nanoid(8)}`;
  const subtreeElements: Record<string, Element> = {};
  const styleIds = new Set<string>();

  const collect = (elId: string) => {
    const el = yElements.get(elId) as Element;
    subtreeElements[el.id] = JSON.parse(JSON.stringify(el));
    for (const sid of el.styleIds) styleIds.add(sid);
    for (const cid of el.children) collect(cid);
  };
  collect(root.id);

  const compDef: ComponentDef = {
    id: compId,
    name: options.name,
    rootElementId: root.id,
    elements: subtreeElements,
    styleIds: Array.from(styleIds),
  };

  yDoc.transact(() => {
    yComponents.set(compId, compDef);
    yElements.set(root.id, {
      ...root,
      instanceOf: {
        componentId: compId,
        overrides: {},
      },
    });
  }, origin);

  return compId;
}

/**
 * 12. detachInstance: Converts a component instance into regular detached elements.
 */
export function detachInstance(yDoc: Y.Doc, options: DetachInstanceOptions, origin = "user"): void {
  const yElements = yDoc.getMap("elements");
  const el = yElements.get(options.elementId) as Element | undefined;
  if (!el || !el.instanceOf) return;

  yDoc.transact(() => {
    const updated = { ...el };
    delete updated.instanceOf;
    yElements.set(el.id, updated);
  }, origin);
}

/**
 * 13. addPage: Adds a new page with a root Body element.
 */
export function addPage(yDoc: Y.Doc, options: AddPageOptions, origin = "user"): string {
  const yPages = yDoc.getMap("pages");
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  const pageId = `page-${nanoid(8)}`;
  const bodyId = `el-body-${nanoid(8)}`;
  const bodyStyleId = `style-${nanoid(8)}`;

  yDoc.transact(() => {
    const bodyStyle: StyleRule = {
      id: bodyStyleId,
      kind: "local",
      values: {
        desktop: {
          default: {
            minHeight: { unit: "vh", value: 100 },
            background: { token: "color.background" },
            color: { token: "color.text" },
          },
        },
      },
    };
    yStyles.set(bodyStyleId, bodyStyle);

    const bodyElement: Element = {
      id: bodyId,
      type: "Body",
      name: "Body",
      parentId: null,
      children: [],
      props: {},
      styleIds: [bodyStyleId],
      origin: "user",
    };
    yElements.set(bodyId, bodyElement);

    const newPage: Page = {
      id: pageId,
      name: options.name,
      slug: options.slug,
      rootId: bodyId,
      seo: options.seo || { title: options.name },
      status: "draft",
    };
    yPages.set(pageId, newPage);
  }, origin);

  return pageId;
}

/**
 * 14. updatePage: Modifies page properties.
 */
export function updatePage(yDoc: Y.Doc, options: UpdatePageOptions, origin = "user"): void {
  const yPages = yDoc.getMap("pages");
  const page = yPages.get(options.pageId) as Page | undefined;
  if (!page) throw new Error(`Page "${options.pageId}" not found.`);

  yDoc.transact(() => {
    yPages.set(options.pageId, {
      ...page,
      ...options.updates,
      id: page.id,
      rootId: page.rootId, // Cannot alter page ID or rootId via updatePage
    });
  }, origin);
}

/**
 * 15. deletePage: Deletes a page and its associated element tree.
 */
export function deletePage(yDoc: Y.Doc, options: DeletePageOptions, origin = "user"): void {
  const yPages = yDoc.getMap("pages");
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  const page = yPages.get(options.pageId) as Page | undefined;
  if (!page) return;

  if (Array.from(yPages.keys()).length <= 1) {
    throw new Error("Cannot delete the only page in the document.");
  }

  yDoc.transact(() => {
    const deleteSubtree = (elId: string) => {
      const el = yElements.get(elId) as Element | undefined;
      if (!el) return;
      for (const childId of el.children) deleteSubtree(childId);
      for (const styleId of el.styleIds) {
        const style = yStyles.get(styleId) as StyleRule | undefined;
        if (style && style.kind === "local") yStyles.delete(styleId);
      }
      yElements.delete(elId);
    };

    deleteSubtree(page.rootId);
    yPages.delete(options.pageId);
  }, origin);
}

/**
 * 16. setToken: Modifies a design token.
 */
export function setToken(yDoc: Y.Doc, options: SetTokenOptions, origin = "user"): void {
  const yTokens = yDoc.getMap("tokens");
  const currentCategory = (yTokens.get(options.category) as Record<string, any>) || {};

  yDoc.transact(() => {
    yTokens.set(options.category, {
      ...currentCategory,
      [options.key]: options.value,
    });
  }, origin);
}

/**
 * 17. applyAiPatch: Applies atomic AI modifications in a single transaction with origin 'ai'.
 */
export function applyAiPatch(yDoc: Y.Doc, options: ApplyAiPatchOptions, origin = "ai"): void {
  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  yDoc.transact(() => {
    if (options.elements) {
      for (const [elId, patch] of Object.entries(options.elements)) {
        const el = yElements.get(elId) as Element | undefined;
        if (el) {
          if (!el.aiLocked) {
            yElements.set(elId, {
              ...el,
              ...patch,
              id: el.id,
              parentId: patch.parentId !== undefined ? patch.parentId : el.parentId,
              children: patch.children !== undefined ? patch.children : el.children,
              props: patch.props ? { ...el.props, ...patch.props } : el.props,
              origin: "ai",
            });
          }
        } else {
          yElements.set(elId, {
            id: elId,
            type: patch.type || "Box",
            name: patch.name || "Element",
            parentId: patch.parentId ?? null,
            children: patch.children || [],
            props: patch.props || {},
            styleIds: patch.styleIds || [],
            origin: "ai",
            ...patch,
          } as Element);
        }
      }
    }

    if (options.styles) {
      for (const [styleId, patch] of Object.entries(options.styles)) {
        const style = yStyles.get(styleId) as StyleRule | undefined;
        if (style) {
          const values = JSON.parse(JSON.stringify(style.values || {}));
          const state = patch.state || "default";
          if (!values[patch.breakpoint]) values[patch.breakpoint] = {};
          if (!values[patch.breakpoint][state]) values[patch.breakpoint][state] = {};
          Object.assign(values[patch.breakpoint][state], patch.declarations);

          yStyles.set(styleId, {
            ...style,
            values,
          });
        } else {
          yStyles.set(styleId, {
            id: styleId,
            kind: "local",
            values: {
              [patch.breakpoint]: {
                [patch.state || "default"]: patch.declarations,
              },
            },
          });
        }
      }
    }
  }, origin);
}

/**
 * 18. serializeSubtree: Extracts an element, all its descendants, and their local styles into a validated ClipboardPayload.
 */
export function serializeSubtree(doc: SiteDocument, elementId: string): ClipboardPayload {
  const rootEl = doc.elements[elementId];
  if (!rootEl) {
    throw new Error(`Element "${elementId}" not found for clipboard serialization.`);
  }

  const elements: Record<string, Element> = {};
  const styles: Record<string, StyleRule> = {};

  const collect = (id: string) => {
    const el = doc.elements[id];
    if (!el) return;
    elements[id] = JSON.parse(JSON.stringify(el));
    for (const styleId of el.styleIds) {
      const st = doc.styles[styleId];
      if (st) {
        styles[styleId] = JSON.parse(JSON.stringify(st));
      }
    }
    for (const childId of el.children) {
      collect(childId);
    }
  };

  collect(elementId);

  const payload: ClipboardPayload = {
    version: 1,
    type: "builder-element-clipboard",
    rootElementId: elementId,
    elements,
    styles,
  };

  return clipboardPayloadSchema.parse(payload);
}

export interface PasteSubtreeOptions {
  payload: unknown;
  targetElementId?: string | undefined;
  pageRootId?: string | undefined;
  index?: number | undefined;
}

const CONTAINER_TYPES = new Set([
  "Body",
  "Section",
  "Box",
  "Container",
  "Form",
  "CmsList",
  "CMS List",
]);

/**
 * 19. pasteSubtree: Inserts clipboard subtree with fresh IDs in a single transaction (1 undo step).
 */
export function pasteSubtree(
  yDoc: Y.Doc,
  options: PasteSubtreeOptions,
  origin = "user"
): string {
  const parsed = clipboardPayloadSchema.parse(options.payload);
  const sourceRoot = parsed.elements[parsed.rootElementId];
  if (!sourceRoot) {
    throw new Error(`Root element "${parsed.rootElementId}" missing from clipboard payload.`);
  }

  const yElements = yDoc.getMap("elements");
  const yStyles = yDoc.getMap("styles");

  let parentId: string | null = null;
  let targetIndex: number | undefined = options.index;

  if (options.targetElementId) {
    const targetEl = yElements.get(options.targetElementId) as Element | undefined;
    if (targetEl) {
      if (CONTAINER_TYPES.has(targetEl.type) || targetEl.parentId === null) {
        // Insert inside container
        parentId = targetEl.id;
        if (targetIndex === undefined) {
          targetIndex = targetEl.children.length;
        }
      } else if (targetEl.parentId) {
        // Insert as sibling after target element
        parentId = targetEl.parentId;
        const parentEl = yElements.get(parentId) as Element | undefined;
        if (parentEl) {
          const siblingIdx = parentEl.children.indexOf(targetEl.id);
          targetIndex = siblingIdx >= 0 ? siblingIdx + 1 : parentEl.children.length;
        }
      }
    }
  }

  // Fallback to page root if no valid parent determined yet
  if (!parentId) {
    if (options.pageRootId && yElements.has(options.pageRootId)) {
      parentId = options.pageRootId;
      const rootEl = yElements.get(parentId) as Element | undefined;
      targetIndex = rootEl ? rootEl.children.length : 0;
    } else {
      // Find any Body element
      for (const [id, rawEl] of yElements.entries()) {
        const el = rawEl as Element;
        if (el.type === "Body" || el.parentId === null) {
          parentId = id;
          targetIndex = el.children.length;
          break;
        }
      }
    }
  }

  if (!parentId) {
    throw new Error("Unable to determine valid insertion parent for pasted element.");
  }

  const parentElement = yElements.get(parentId) as Element | undefined;
  if (!parentElement) {
    throw new Error(`Insertion parent "${parentId}" not found in document.`);
  }

  let newRootId = "";

  yDoc.transact(() => {
    // 1. Build fresh IDs map
    const elementIdMap: Record<string, string> = {};
    for (const oldId of Object.keys(parsed.elements)) {
      elementIdMap[oldId] = `el-${nanoid(8)}`;
    }
    newRootId = elementIdMap[parsed.rootElementId]!;

    const styleIdMap: Record<string, string> = {};
    for (const [oldStyleId, style] of Object.entries(parsed.styles)) {
      if (style.kind === "local") {
        styleIdMap[oldStyleId] = `style-${nanoid(8)}`;
      } else {
        styleIdMap[oldStyleId] = oldStyleId; // preserve shared class
      }
    }

    // 2. Clone styles
    for (const [oldStyleId, style] of Object.entries(parsed.styles)) {
      const freshStyleId = styleIdMap[oldStyleId]!;
      yStyles.set(freshStyleId, {
        ...JSON.parse(JSON.stringify(style)),
        id: freshStyleId,
      });
    }

    // 3. Clone elements
    for (const [oldElId, el] of Object.entries(parsed.elements)) {
      const freshElId = elementIdMap[oldElId]!;
      const isRoot = oldElId === parsed.rootElementId;
      const clonedParentId = isRoot ? parentId : (elementIdMap[el.parentId ?? ""] ?? parentId);
      const clonedChildren = el.children.map((cid: string) => elementIdMap[cid] || cid);
      const clonedStyleIds = el.styleIds.map((sid: string) => styleIdMap[sid] || sid);

      const clonedElement: Element = {
        ...JSON.parse(JSON.stringify(el)),
        id: freshElId,
        parentId: clonedParentId,
        children: clonedChildren,
        styleIds: clonedStyleIds,
        origin: "user",
      };

      yElements.set(freshElId, clonedElement);
    }

    // 4. Attach new root to parent element children list
    const updatedChildren = [...parentElement.children];
    const insertAt =
      targetIndex !== undefined && targetIndex >= 0 && targetIndex <= updatedChildren.length
        ? targetIndex
        : updatedChildren.length;
    updatedChildren.splice(insertAt, 0, newRootId);

    yElements.set(parentId, {
      ...parentElement,
      children: updatedChildren,
    });
  }, origin);

  return newRootId;
}

