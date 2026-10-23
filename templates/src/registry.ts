import type { TemplateDefinition } from "./types.js";
import { saasLandingTemplate } from "./data/saas-landing.js";
import { agencyPortfolioTemplate } from "./data/agency-portfolio.js";
import { restaurantCafeTemplate } from "./data/restaurant-cafe.js";
import { ecommerceShowcaseTemplate } from "./data/ecommerce-showcase.js";
import { creatorBlogTemplate } from "./data/creator-blog.js";

export const TEMPLATES: TemplateDefinition[] = [
  saasLandingTemplate,
  agencyPortfolioTemplate,
  restaurantCafeTemplate,
  ecommerceShowcaseTemplate,
  creatorBlogTemplate,
];

export function getAllTemplates(): TemplateDefinition[] {
  return TEMPLATES;
}

export function getTemplateById(id: string): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplateBySlug(slug: string): TemplateDefinition | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function getTemplatesByCategory(category: string): TemplateDefinition[] {
  if (category === "All" || !category) {
    return TEMPLATES;
  }
  return TEMPLATES.filter((t) => t.category.toLowerCase() === category.toLowerCase());
}
