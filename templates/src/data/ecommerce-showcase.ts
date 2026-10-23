import { TemplateDocumentBuilder } from "../builder.js";
import type { TemplateDefinition } from "../types.js";

function buildEcommerceDoc() {
  const b = new TemplateDocumentBuilder(
    "Lumina Goods",
    {
      colors: {
        "color.primary": "#059669",
        "color.primaryForeground": "#ffffff",
        "color.secondary": "#f4f4f5",
        "color.secondaryForeground": "#18181b",
        "color.accent": "#10b981",
        "color.accentForeground": "#ffffff",
        "color.background": "#ffffff",
        "color.surface": "#fafafa",
        "color.text": "#18181b",
        "color.textMuted": "#71717a",
        "color.border": "#e4e4e7",
      },
      fonts: {
        heading: "Inter, system-ui, sans-serif",
        body: "Inter, system-ui, sans-serif",
      },
    },
    "shop"
  );

  // --- Page 1: Home (/) ---
  const { bodyId: homeBody } = b.addPage("Home", "/", {
    title: "Lumina Goods — Thoughtfully Designed Everyday Essentials",
    description: "Discover handcrafted home goods, accessories, and travel gear crafted from sustainable materials.",
  });

  b.addNavbar(
    homeBody,
    "Lumina Goods",
    [
      { text: "Shop", href: "/shop" },
      { text: "About", href: "/about" },
    ],
    { text: "Cart (0)", href: "/shop" }
  );

  // Hero Section
  const heroSec = b.addElement(homeBody, "Section", "Hero Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const heroContainer = b.addElement(heroSec, "Container", "Hero Container", {}, { maxWidth: { unit: "px", value: 1200 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, display: { keyword: "grid" }, gridTemplateColumns: { keyword: "1.2fr 1fr" }, alignItems: { keyword: "center" }, gap: { unit: "px", value: 48 } }, { gridTemplateColumns: { keyword: "1fr" } });

  const heroTextBox = b.addElement(heroContainer, "Box", "Hero Text Column", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 20 } });
  b.addElement(heroTextBox, "Text", "Hero Tagline", { text: "AUTUMN / WINTER 2026 COLLECTION" }, { fontSize: { unit: "px", value: 12 }, letterSpacing: { unit: "px", value: 2 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" } });
  b.addElement(heroTextBox, "Heading", "Hero Title", { text: "Thoughtfully designed objects for everyday life.", level: 1 }, { fontSize: { unit: "px", value: 52 }, fontWeight: { keyword: "bold" }, lineHeight: { keyword: "tight" } }, { fontSize: { unit: "px", value: 36 } });
  b.addElement(heroTextBox, "Text", "Hero Subtitle", { text: "Minimalist travel essentials, ceramic tablewares, and desk tools engineered for enduring durability and quiet beauty." }, { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });

  const heroBtnBox = b.addElement(heroTextBox, "Box", "Hero Buttons", {}, { display: { keyword: "flex" }, gap: { unit: "px", value: 16 }, marginTop: { unit: "px", value: 8 } });
  b.addElement(heroBtnBox, "Button", "Shop CTA", { text: "Shop New Arrivals", href: "/shop", variant: "primary" }, { backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 }, paddingTop: { unit: "px", value: 12 }, paddingBottom: { unit: "px", value: 12 }, borderRadius: { token: "radius.md" }, fontWeight: { keyword: "bold" } });

  b.addElement(heroContainer, "Image", "Hero Showcase Image", { src: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80", alt: "Minimalist ceramic vase and notebooks arranged on clean surface" }, { width: { unit: "%", value: 100 }, height: { unit: "px", value: 460 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.lg" } });

  // Best Sellers Grid
  const prodSec = b.addElement(homeBody, "Section", "Best Sellers Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 }, backgroundColor: { token: "color.surface" } });
  const prodContainer = b.addElement(prodSec, "Container", "Products Container", {}, { maxWidth: { unit: "px", value: 1200 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(prodContainer, "Heading", "Best Sellers Title", { text: "Best Sellers", level: 2 }, { fontSize: { unit: "px", value: 32 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 40 } });

  const prodGrid = b.addElement(prodContainer, "Box", "Products Grid", {}, { display: { keyword: "grid" }, gridTemplateColumns: { keyword: "repeat(3, 1fr)" }, gap: { unit: "px", value: 32 } }, { gridTemplateColumns: { keyword: "1fr" } });

  const products = [
    { title: "Ceramic Pour-Over Dripper", price: "$48.00", img: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80" },
    { title: "Waxed Canvas Weekender", price: "$145.00", img: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80" },
    { title: "Machined Brass Desk Pen", price: "$65.00", img: "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=80" },
  ];

  for (const p of products) {
    const card = b.addElement(prodGrid, "Box", "Product Card", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 12 }, backgroundColor: { token: "color.background" }, padding: { unit: "px", value: 16 }, borderRadius: { token: "radius.lg" } });
    b.addElement(card, "Image", "Product Image", { src: p.img, alt: `${p.title} product photo` }, { width: { unit: "%", value: 100 }, height: { unit: "px", value: 280 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.md" } });
    b.addElement(card, "Heading", "Product Title", { text: p.title, level: 3 }, { fontSize: { unit: "px", value: 18 }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Text", "Product Price", { text: p.price }, { fontSize: { unit: "px", value: 16 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Button", "Add to Cart", { text: "Add to Bag", href: "/shop", variant: "secondary" }, { backgroundColor: { token: "color.secondary" }, color: { token: "color.secondaryForeground" }, padding: { unit: "px", value: 10 }, borderRadius: { token: "radius.md" }, textAlign: { keyword: "center" }, fontWeight: { keyword: "medium" } });
  }

  // Newsletter Section
  const newsSec = b.addElement(homeBody, "Section", "Newsletter Section", {}, { paddingTop: { unit: "px", value: 64 }, paddingBottom: { unit: "px", value: 64 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const newsContainer = b.addElement(newsSec, "Container", "Newsletter Container", {}, { maxWidth: { unit: "px", value: 600 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, textAlign: { keyword: "center" } });
  b.addElement(newsContainer, "Heading", "Newsletter Heading", { text: "Join the Lumina Collective", level: 3 }, { fontSize: { unit: "px", value: 26 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 12 } });
  b.addElement(newsContainer, "Text", "Newsletter Desc", { text: "Receive preview access to limited seasonal runs and 15% off your first purchase." }, { fontSize: { unit: "px", value: 15 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 24 } });

  const newsForm = b.addElement(newsContainer, "Form", "Newsletter Form", { name: "Newsletter", method: "POST" }, { display: { keyword: "flex" }, gap: { unit: "px", value: 12 }, justifyContent: { keyword: "center" } }, { flexDirection: { keyword: "column" } });
  b.addElement(newsForm, "Input", "Newsletter Email", { name: "email", placeholder: "Enter your email address", type: "email", required: true }, { padding: { unit: "px", value: 12 }, width: { unit: "px", value: 300 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(newsForm, "Submit", "Subscribe Button", { text: "Subscribe" }, { padding: { unit: "px", value: 12 }, paddingLeft: { unit: "px", value: 20 }, paddingRight: { unit: "px", value: 20 }, backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, borderRadius: { token: "radius.md" }, fontWeight: { keyword: "bold" } });

  b.addFooter(homeBody, "Lumina Goods", "Everyday objects crafted for enduring life.", [
    { text: "Home", href: "/" },
    { text: "Shop", href: "/shop" },
    { text: "About", href: "/about" },
  ]);

  // --- Page 2: Shop (/shop) ---
  const { bodyId: shopBody } = b.addPage("Shop", "/shop", {
    title: "Catalog & New Releases — Lumina Goods",
    description: "Browse the complete collection of minimalist homewares, bags, and tools.",
  });

  b.addNavbar(
    shopBody,
    "Lumina Goods",
    [
      { text: "Shop", href: "/shop" },
      { text: "About", href: "/about" },
    ],
    { text: "Cart (0)", href: "/shop" }
  );

  const shopSec = b.addElement(shopBody, "Section", "Shop Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const shopContainer = b.addElement(shopSec, "Container", "Shop Container", {}, { maxWidth: { unit: "px", value: 1200 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(shopContainer, "Heading", "Shop Heading", { text: "The Complete Collection", level: 1 }, { fontSize: { unit: "px", value: 44 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 16 } });
  b.addElement(shopContainer, "Text", "Shop Subtitle", { text: "Handcrafted in small batches with full traceability of all raw materials." }, { fontSize: { unit: "px", value: 16 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 48 } });

  const shopGrid = b.addElement(shopContainer, "Box", "Shop Grid", {}, { display: { keyword: "grid" }, gridTemplateColumns: { keyword: "repeat(3, 1fr)" }, gap: { unit: "px", value: 32 } }, { gridTemplateColumns: { keyword: "1fr" } });
  for (const p of products) {
    const card = b.addElement(shopGrid, "Box", "Shop Item Card", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 12 }, backgroundColor: { token: "color.surface" }, padding: { unit: "px", value: 16 }, borderRadius: { token: "radius.lg" } });
    b.addElement(card, "Image", "Product Image", { src: p.img, alt: `${p.title} shop catalog photo` }, { width: { unit: "%", value: 100 }, height: { unit: "px", value: 280 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.md" } });
    b.addElement(card, "Heading", "Product Title", { text: p.title, level: 3 }, { fontSize: { unit: "px", value: 18 }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Text", "Product Price", { text: p.price }, { fontSize: { unit: "px", value: 16 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Button", "Add to Bag", { text: "Add to Bag", href: "/shop", variant: "primary" }, { backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, padding: { unit: "px", value: 10 }, borderRadius: { token: "radius.md" }, textAlign: { keyword: "center" }, fontWeight: { keyword: "medium" } });
  }

  b.addFooter(shopBody, "Lumina Goods", "Everyday objects crafted for enduring life.", [
    { text: "Home", href: "/" },
    { text: "Shop", href: "/shop" },
    { text: "About", href: "/about" },
  ]);

  // --- Page 3: About (/about) ---
  const { bodyId: aboutBody } = b.addPage("About", "/about", {
    title: "Our Story & Craftsmanship — Lumina Goods",
    description: "Learn about our founding philosophy, ethical manufacturing, and material standards.",
  });

  b.addNavbar(
    aboutBody,
    "Lumina Goods",
    [
      { text: "Shop", href: "/shop" },
      { text: "About", href: "/about" },
    ],
    { text: "Cart (0)", href: "/shop" }
  );

  const aboutSec = b.addElement(aboutBody, "Section", "About Story Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const aboutContainer = b.addElement(aboutSec, "Container", "About Container", {}, { maxWidth: { unit: "px", value: 800 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 24 } });
  b.addElement(aboutContainer, "Heading", "About Title", { text: "Built to Outlast Trends", level: 1 }, { fontSize: { unit: "px", value: 48 }, fontWeight: { keyword: "bold" } });
  b.addElement(aboutContainer, "Text", "About Story", { text: "Founded in 2021, Lumina was born from frustration with disposable design. We partner with legacy manufacturers who take pride in their trade, using non-toxic glazes, vegetable-tanned leathers, and recycled solid brass that develops rich character over decades of use." }, { fontSize: { unit: "px", value: 18 }, lineHeight: { keyword: "relaxed" }, color: { token: "color.textMuted" } });
  b.addElement(aboutContainer, "Image", "Atelier Image", { src: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1000&q=80", alt: "Artisan wood and leather workshop crafting goods by hand" }, { width: { unit: "%", value: 100 }, height: { unit: "px", value: 400 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.lg" } });

  b.addFooter(aboutBody, "Lumina Goods", "Everyday objects crafted for enduring life.", [
    { text: "Home", href: "/" },
    { text: "Shop", href: "/shop" },
    { text: "About", href: "/about" },
  ]);

  return b.build();
}

export const ecommerceShowcaseTemplate: TemplateDefinition = {
  id: "tmpl_ecommerce_showcase",
  slug: "ecommerce-showcase",
  name: "Lumina Goods",
  category: "E-Commerce",
  description: "Minimalist direct-to-consumer lifestyle brand storefront with curated product catalog and newsletter capture.",
  tags: ["ecommerce", "store", "shop", "lifestyle", "products", "minimal"],
  preview: "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80",
  pageCount: 3,
  style: "clean-commerce",
  document: buildEcommerceDoc(),
};
