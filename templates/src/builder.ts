import { nanoid } from "nanoid";
import type {
  SiteDocument,
  Page,
  Element,
  StyleRule,
  DesignTokens,
  CSSDeclarations,
} from "@builder/document";
import { DEFAULT_BREAKPOINTS, DEFAULT_TOKENS } from "@builder/document";

export class TemplateDocumentBuilder {
  private doc: SiteDocument;
  private idPrefix: string;

  constructor(siteName: string, customTokens?: Partial<DesignTokens>, idPrefix = "tmpl") {
    this.idPrefix = idPrefix;
    this.doc = {
      schemaVersion: 1,
      site: {
        name: siteName,
        defaultLocale: "en",
        locales: ["en"],
      },
      breakpoints: DEFAULT_BREAKPOINTS,
      tokens: {
        ...DEFAULT_TOKENS,
        ...(customTokens || {}),
        colors: {
          ...DEFAULT_TOKENS.colors,
          ...(customTokens?.colors || {}),
        },
        fonts: {
          ...DEFAULT_TOKENS.fonts,
          ...(customTokens?.fonts || {}),
        },
        radius: {
          ...DEFAULT_TOKENS.radius,
          ...(customTokens?.radius || {}),
        },
      },
      pages: {},
      elements: {},
      styles: {},
      components: {},
      assets: {},
    };
  }

  private nextId(prefix: string): string {
    return `${this.idPrefix}_${prefix}_${nanoid(8)}`;
  }

  public addPage(name: string, slug: string, seo: { title: string; description: string }): { pageId: string; bodyId: string } {
    const pageId = this.nextId("pg");
    const bodyId = this.nextId("body");
    const bodyStyleId = this.nextId("st");

    const bodyStyle: StyleRule = {
      id: bodyStyleId,
      kind: "local",
      values: {
        desktop: {
          default: {
            minHeight: { unit: "vh", value: 100 },
            backgroundColor: { token: "color.background" },
            color: { token: "color.text" },
            fontFamily: { token: "fonts.body" },
            margin: { unit: "px", value: 0 },
            padding: { unit: "px", value: 0 },
            display: { keyword: "flex" },
            flexDirection: { keyword: "column" },
          },
        },
      },
    };

    const bodyElement: Element = {
      id: bodyId,
      type: "Body",
      name: `${name} Page Body`,
      parentId: null,
      children: [],
      props: {},
      styleIds: [bodyStyleId],
      origin: "template",
    };

    const page: Page = {
      id: pageId,
      name,
      slug,
      rootId: bodyId,
      seo,
      status: "published",
    };

    this.doc.styles[bodyStyleId] = bodyStyle;
    this.doc.elements[bodyId] = bodyElement;
    this.doc.pages[pageId] = page;

    return { pageId, bodyId };
  }

  public addElement(
    parentId: string,
    type: string,
    name: string,
    props: Record<string, any> = {},
    desktopCSS: CSSDeclarations = {},
    mobileCSS?: CSSDeclarations
  ): string {
    const elId = this.nextId(type.toLowerCase());
    const styleId = this.nextId("st");

    const styleRule: StyleRule = {
      id: styleId,
      kind: "local",
      values: {
        desktop: {
          default: desktopCSS,
        },
        ...(mobileCSS
          ? {
              mobile: {
                default: mobileCSS,
              },
            }
          : {}),
      },
    };

    const element: Element = {
      id: elId,
      type,
      name,
      parentId,
      children: [],
      props,
      styleIds: [styleId],
      origin: "template",
    };

    this.doc.styles[styleId] = styleRule;
    this.doc.elements[elId] = element;

    // Link into parent
    const parent = this.doc.elements[parentId];
    if (parent) {
      parent.children.push(elId);
    }

    return elId;
  }

  public addNavbar(
    parentId: string,
    brandName: string,
    links: Array<{ text: string; href: string }>,
    cta?: { text: string; href: string }
  ): string {
    const navId = this.addElement(
      parentId,
      "Navbar",
      "Site Navigation",
      { brandText: brandName },
      {
        display: { keyword: "flex" },
        justifyContent: { keyword: "space-between" },
        alignItems: { keyword: "center" },
        paddingTop: { unit: "px", value: 16 },
        paddingBottom: { unit: "px", value: 16 },
        paddingLeft: { unit: "px", value: 32 },
        paddingRight: { unit: "px", value: 32 },
        borderBottomWidth: { unit: "px", value: 1 },
        borderBottomStyle: { keyword: "solid" },
        borderBottomColor: { token: "color.border" },
        backgroundColor: { token: "color.background" },
      }
    );

    // Brand Link
    const brandBox = this.addElement(
      navId,
      "Box",
      "Brand Container",
      {},
      { display: { keyword: "flex" }, alignItems: { keyword: "center" }, gap: { unit: "px", value: 12 } }
    );
    this.addElement(
      brandBox,
      "Heading",
      "Brand Title",
      { text: brandName, level: 3 },
      { fontSize: { unit: "px", value: 20 }, fontWeight: { keyword: "bold" }, color: { token: "color.primary" } }
    );

    // Links Container
    const linksBox = this.addElement(
      navId,
      "Box",
      "Nav Links",
      {},
      { display: { keyword: "flex" }, alignItems: { keyword: "center" }, gap: { unit: "px", value: 24 } },
      { display: { keyword: "none" } }
    );
    for (const link of links) {
      this.addElement(
        linksBox,
        "Link",
        link.text,
        { text: link.text, href: link.href },
        {
          fontSize: { unit: "px", value: 14 },
          color: { token: "color.textMuted" },
          textDecoration: { keyword: "none" },
        }
      );
    }

    // CTA
    if (cta) {
      this.addElement(
        navId,
        "Button",
        "Nav CTA",
        { text: cta.text, href: cta.href, variant: "primary" },
        {
          backgroundColor: { token: "color.primary" },
          color: { token: "color.primaryForeground" },
          paddingLeft: { unit: "px", value: 18 },
          paddingRight: { unit: "px", value: 18 },
          paddingTop: { unit: "px", value: 8 },
          paddingBottom: { unit: "px", value: 8 },
          borderRadius: { token: "radius.md" },
          fontSize: { unit: "px", value: 14 },
          fontWeight: { keyword: "medium" },
        }
      );
    }

    return navId;
  }

  public addFooter(
    parentId: string,
    brandName: string,
    tagline: string,
    links: Array<{ text: string; href: string }>
  ): string {
    const footerSec = this.addElement(
      parentId,
      "Section",
      "Footer Section",
      {},
      {
        marginTop: { keyword: "auto" },
        paddingTop: { unit: "px", value: 64 },
        paddingBottom: { unit: "px", value: 48 },
        paddingLeft: { unit: "px", value: 32 },
        paddingRight: { unit: "px", value: 32 },
        borderTopWidth: { unit: "px", value: 1 },
        borderTopStyle: { keyword: "solid" },
        borderTopColor: { token: "color.border" },
        backgroundColor: { token: "color.surface" },
      }
    );

    const container = this.addElement(
      footerSec,
      "Container",
      "Footer Container",
      {},
      {
        maxWidth: { unit: "px", value: 1200 },
        marginLeft: { keyword: "auto" },
        marginRight: { keyword: "auto" },
        display: { keyword: "flex" },
        justifyContent: { keyword: "space-between" },
        alignItems: { keyword: "center" },
        flexWrap: { keyword: "wrap" },
        gap: { unit: "px", value: 24 },
      }
    );

    const brandCol = this.addElement(container, "Box", "Footer Brand Info", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 8 } });
    this.addElement(brandCol, "Heading", "Footer Brand", { text: brandName, level: 4 }, { fontSize: { unit: "px", value: 18 }, fontWeight: { keyword: "bold" }, color: { token: "color.primary" } });
    this.addElement(brandCol, "Text", "Footer Tagline", { text: tagline }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" } });
    this.addElement(brandCol, "Text", "Footer Copyright", { text: `© ${new Date().getFullYear()} ${brandName}. All rights reserved.` }, { fontSize: { unit: "px", value: 12 }, color: { token: "color.textMuted" } });

    const linksCol = this.addElement(container, "Box", "Footer Links", {}, { display: { keyword: "flex" }, gap: { unit: "px", value: 24 } });
    for (const link of links) {
      this.addElement(linksCol, "Link", link.text, { text: link.text, href: link.href }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" } });
    }

    return footerSec;
  }

  public build(): SiteDocument {
    return this.doc;
  }
}
