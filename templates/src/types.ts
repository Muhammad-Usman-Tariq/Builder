import type { SiteDocument } from "@builder/document";

export interface TemplateDefinition {
  id: string;
  slug: string;
  name: string;
  category: "SaaS" | "Agency" | "Restaurant" | "E-Commerce" | "Creator";
  description: string;
  tags: string[];
  preview: string;
  pageCount: number;
  style: string;
  document: SiteDocument;
}

export interface TemplateCertificationResult {
  slug: string;
  name: string;
  valid: boolean;
  pageCount: number;
  elementCount: number;
  errors: string[];
  warnings: string[];
}
