import type { ElementDefinition } from "../types/index.js";
import {
  bodyDefinition,
  sectionDefinition,
  boxDefinition,
  containerDefinition,
} from "../primitives/layout.js";
import {
  headingDefinition,
  textDefinition,
  richTextDefinition,
  imageDefinition,
  linkDefinition,
  buttonDefinition,
  iconDefinition,
} from "../primitives/content.js";
import { navbarDefinition } from "../primitives/navigation.js";
import {
  formDefinition,
  inputDefinition,
  textareaDefinition,
  submitDefinition,
} from "../primitives/forms.js";
import {
  cmsListDefinition,
  cmsFieldDefinition,
} from "../primitives/cms.js";

export const ELEMENT_REGISTRY: Record<string, ElementDefinition<any>> = {
  // Layout
  Body: bodyDefinition,
  Section: sectionDefinition,
  Box: boxDefinition,
  Container: containerDefinition,
  // Content
  Heading: headingDefinition,
  Text: textDefinition,
  RichText: richTextDefinition,
  Image: imageDefinition,
  Link: linkDefinition,
  Button: buttonDefinition,
  Icon: iconDefinition,
  // Navigation
  Navbar: navbarDefinition,
  // Forms
  Form: formDefinition,
  Input: inputDefinition,
  Textarea: textareaDefinition,
  Submit: submitDefinition,
  // CMS
  CmsList: cmsListDefinition,
  "CMS List": cmsListDefinition,
  CmsField: cmsFieldDefinition,
  "CMS Field": cmsFieldDefinition,
};

export function getElementDefinition(type: string): ElementDefinition<any> | undefined {
  return ELEMENT_REGISTRY[type];
}

export function getAllElementDefinitions(): ElementDefinition<any>[] {
  return Object.values(ELEMENT_REGISTRY);
}

/**
 * Checks whether an element of type `childType` is allowed as a child inside `parentType`.
 */
export function validateElementNesting(parentType: string, childType: string): boolean {
  const parentDef = getElementDefinition(parentType);
  const childDef = getElementDefinition(childType);

  if (!parentDef || !childDef) return false;
  if (!parentDef.canHaveChildren) return false;

  // Check parent's allowed children whitelist
  if (parentDef.allowedChildren && parentDef.allowedChildren.length > 0) {
    if (!parentDef.allowedChildren.includes(childType)) return false;
  }

  // Check child's allowed parents whitelist
  if (childDef.allowedParents && childDef.allowedParents.length > 0) {
    if (!childDef.allowedParents.includes(parentType)) return false;
  }

  return true;
}
