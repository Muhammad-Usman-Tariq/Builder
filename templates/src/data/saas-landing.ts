import { TemplateDocumentBuilder } from "../builder.js";
import type { TemplateDefinition } from "../types.js";

function buildSaasLandingDoc() {
  const b = new TemplateDocumentBuilder(
    "Apex Cloud",
    {
      colors: {
        "color.primary": "#2563eb",
        "color.primaryForeground": "#ffffff",
        "color.secondary": "#1e293b",
        "color.secondaryForeground": "#f8fafc",
        "color.accent": "#38bdf8",
        "color.accentForeground": "#0f172a",
        "color.background": "#0b0f19",
        "color.surface": "#111827",
        "color.text": "#f9fafb",
        "color.textMuted": "#9ca3af",
        "color.border": "#1f2937",
      },
      fonts: {
        heading: "Inter, system-ui, sans-serif",
        body: "Inter, system-ui, sans-serif",
        mono: "ui-monospace, monospace",
      },
    },
    "saas"
  );

  // --- Page 1: Home (/) ---
  const { bodyId: homeBody } = b.addPage("Home", "/", {
    title: "Apex Cloud — High-Performance Cloud Infrastructure",
    description: "Scale distributed microservices and databases worldwide with zero friction.",
  });

  b.addNavbar(
    homeBody,
    "Apex Cloud",
    [
      { text: "Features", href: "/#features" },
      { text: "Pricing", href: "/pricing" },
      { text: "About", href: "/#about" },
    ],
    { text: "Start Free", href: "/pricing" }
  );

  // Hero Section
  const heroSec = b.addElement(
    homeBody,
    "Section",
    "Hero Section",
    {},
    {
      paddingTop: { unit: "px", value: 96 },
      paddingBottom: { unit: "px", value: 80 },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      textAlign: { keyword: "center" },
    }
  );

  const heroContainer = b.addElement(
    heroSec,
    "Container",
    "Hero Container",
    {},
    {
      maxWidth: { unit: "px", value: 896 },
      marginLeft: { keyword: "auto" },
      marginRight: { keyword: "auto" },
      display: { keyword: "flex" },
      flexDirection: { keyword: "column" },
      alignItems: { keyword: "center" },
      gap: { unit: "px", value: 24 },
    }
  );

  // Announcement Badge
  b.addElement(
    heroContainer,
    "Text",
    "Release Badge",
    { text: "⚡ Next-Gen Cloud Platform — Version 2.4 Released" },
    {
      fontSize: { unit: "px", value: 13 },
      color: { token: "color.accent" },
      backgroundColor: { token: "color.surface" },
      borderWidth: { unit: "px", value: 1 },
      borderStyle: { keyword: "solid" },
      borderColor: { token: "color.border" },
      borderRadius: { token: "radius.full" },
      paddingLeft: { unit: "px", value: 16 },
      paddingRight: { unit: "px", value: 16 },
      paddingTop: { unit: "px", value: 6 },
      paddingBottom: { unit: "px", value: 6 },
    }
  );

  b.addElement(
    heroContainer,
    "Heading",
    "Hero Headline",
    { text: "Scale your cloud infrastructure with zero friction", level: 1 },
    {
      fontSize: { unit: "px", value: 56 },
      fontWeight: { keyword: "bold" },
      lineHeight: { keyword: "tight" },
      color: { token: "color.text" },
    },
    {
      fontSize: { unit: "px", value: 36 },
    }
  );

  b.addElement(
    heroContainer,
    "Text",
    "Hero Subhead",
    {
      text: "Deploy globally distributed microservices, serverless databases, and background workers in seconds. Built for modern engineering teams who demand extreme speed and uptime.",
    },
    {
      fontSize: { unit: "px", value: 18 },
      color: { token: "color.textMuted" },
      maxWidth: { unit: "px", value: 680 },
      lineHeight: { keyword: "relaxed" },
    }
  );

  const heroCtaBox = b.addElement(
    heroContainer,
    "Box",
    "Hero Buttons",
    {},
    {
      display: { keyword: "flex" },
      gap: { unit: "px", value: 16 },
      justifyContent: { keyword: "center" },
      marginTop: { unit: "px", value: 8 },
    }
  );

  b.addElement(
    heroCtaBox,
    "Button",
    "Primary CTA",
    { text: "Start 14-Day Free Trial", href: "/pricing", variant: "primary" },
    {
      backgroundColor: { token: "color.primary" },
      color: { token: "color.primaryForeground" },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      paddingTop: { unit: "px", value: 12 },
      paddingBottom: { unit: "px", value: 12 },
      borderRadius: { token: "radius.md" },
      fontWeight: { keyword: "bold" },
      fontSize: { unit: "px", value: 16 },
    }
  );

  b.addElement(
    heroCtaBox,
    "Button",
    "Secondary CTA",
    { text: "Explore Architecture", href: "/#features", variant: "secondary" },
    {
      backgroundColor: { token: "color.surface" },
      color: { token: "color.text" },
      borderWidth: { unit: "px", value: 1 },
      borderStyle: { keyword: "solid" },
      borderColor: { token: "color.border" },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      paddingTop: { unit: "px", value: 12 },
      paddingBottom: { unit: "px", value: 12 },
      borderRadius: { token: "radius.md" },
      fontSize: { unit: "px", value: 16 },
    }
  );

  // Hero Image Banner
  b.addElement(
    heroContainer,
    "Image",
    "Dashboard Preview",
    {
      src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
      alt: "Apex Cloud analytics dashboard showing real-time latency and resource distribution",
    },
    {
      maxWidth: { unit: "px", value: 1000 },
      width: { unit: "%", value: 100 },
      borderRadius: { token: "radius.lg" },
      borderWidth: { unit: "px", value: 1 },
      borderStyle: { keyword: "solid" },
      borderColor: { token: "color.border" },
      marginTop: { unit: "px", value: 32 },
    }
  );

  // Features Section
  const featSec = b.addElement(
    homeBody,
    "Section",
    "Features Section",
    {},
    {
      paddingTop: { unit: "px", value: 80 },
      paddingBottom: { unit: "px", value: 80 },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      backgroundColor: { token: "color.surface" },
    }
  );

  const featContainer = b.addElement(
    featSec,
    "Container",
    "Features Container",
    {},
    {
      maxWidth: { unit: "px", value: 1200 },
      marginLeft: { keyword: "auto" },
      marginRight: { keyword: "auto" },
    }
  );

  b.addElement(
    featContainer,
    "Heading",
    "Features Title",
    { text: "Engineered for speed, built for reliability", level: 2 },
    {
      fontSize: { unit: "px", value: 36 },
      fontWeight: { keyword: "bold" },
      textAlign: { keyword: "center" },
      marginBottom: { unit: "px", value: 48 },
    }
  );

  const featGrid = b.addElement(
    featContainer,
    "Box",
    "Feature Cards Grid",
    {},
    {
      display: { keyword: "grid" },
      gridTemplateColumns: { keyword: "repeat(3, 1fr)" },
      gap: { unit: "px", value: 32 },
    },
    {
      gridTemplateColumns: { keyword: "1fr" },
    }
  );

  const features = [
    {
      title: "Sub-millisecond Latency",
      desc: "Our worldwide edge network routes traffic through 300+ PoPs, caching data directly next to your active end users.",
    },
    {
      title: "Autonomous Auto-scaling",
      desc: "Instant scale from zero to one million concurrent connections without cold starts, manual cluster tuning, or overprovisioning.",
    },
    {
      title: "Zero-Trust Security",
      desc: "End-to-end TLS 1.3 encryption, automatic SSL certificate rotation, granular RBAC, and SOC2 compliant audit logging built in.",
    },
  ];

  for (const f of features) {
    const card = b.addElement(
      featGrid,
      "Box",
      "Feature Card",
      {},
      {
        padding: { unit: "px", value: 32 },
        backgroundColor: { token: "color.background" },
        borderRadius: { token: "radius.lg" },
        borderWidth: { unit: "px", value: 1 },
        borderStyle: { keyword: "solid" },
        borderColor: { token: "color.border" },
      }
    );
    b.addElement(
      card,
      "Heading",
      "Card Title",
      { text: f.title, level: 3 },
      { fontSize: { unit: "px", value: 20 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 12 } }
    );
    b.addElement(
      card,
      "Text",
      "Card Description",
      { text: f.desc },
      { fontSize: { unit: "px", value: 15 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } }
    );
  }

  b.addFooter(homeBody, "Apex Cloud", "The next-generation developer cloud.", [
    { text: "Home", href: "/" },
    { text: "Pricing", href: "/pricing" },
  ]);

  // --- Page 2: Pricing (/pricing) ---
  const { bodyId: pricingBody } = b.addPage("Pricing", "/pricing", {
    title: "Pricing Plans — Apex Cloud",
    description: "Transparent pricing designed to scale from early-stage prototype to global enterprise.",
  });

  b.addNavbar(
    pricingBody,
    "Apex Cloud",
    [
      { text: "Features", href: "/#features" },
      { text: "Pricing", href: "/pricing" },
      { text: "About", href: "/#about" },
    ],
    { text: "Start Free", href: "/pricing" }
  );

  const pricingSec = b.addElement(
    pricingBody,
    "Section",
    "Pricing Section",
    {},
    {
      paddingTop: { unit: "px", value: 80 },
      paddingBottom: { unit: "px", value: 80 },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
    }
  );

  const pricingContainer = b.addElement(
    pricingSec,
    "Container",
    "Pricing Container",
    {},
    {
      maxWidth: { unit: "px", value: 1100 },
      marginLeft: { keyword: "auto" },
      marginRight: { keyword: "auto" },
      textAlign: { keyword: "center" },
    }
  );

  b.addElement(
    pricingContainer,
    "Heading",
    "Pricing Header",
    { text: "Simple, predictable pricing", level: 1 },
    { fontSize: { unit: "px", value: 48 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 16 } }
  );

  b.addElement(
    pricingContainer,
    "Text",
    "Pricing Subhead",
    { text: "No hidden charges or unexpected overages. Upgrade or downgrade at any time." },
    { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 56 } }
  );

  const priceGrid = b.addElement(
    pricingContainer,
    "Box",
    "Pricing Tiers Grid",
    {},
    {
      display: { keyword: "grid" },
      gridTemplateColumns: { keyword: "repeat(3, 1fr)" },
      gap: { unit: "px", value: 32 },
      textAlign: { keyword: "left" },
    },
    {
      gridTemplateColumns: { keyword: "1fr" },
    }
  );

  const tiers = [
    {
      name: "Starter",
      price: "$29",
      desc: "Perfect for indie hackers and side projects launching to their first users.",
      cta: "Get Started",
      highlight: false,
    },
    {
      name: "Pro",
      price: "$99",
      desc: "For fast-scaling engineering teams needing high limits and 99.99% uptime.",
      cta: "Start 14-Day Pro Trial",
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      desc: "Dedicated isolation, custom SLAs, VPC peering, and 24/7 priority support.",
      cta: "Contact Sales",
      highlight: false,
    },
  ];

  for (const tier of tiers) {
    const card = b.addElement(
      priceGrid,
      "Box",
      `${tier.name} Tier Card`,
      {},
      {
        padding: { unit: "px", value: 36 },
        backgroundColor: { token: "color.surface" },
        borderRadius: { token: "radius.lg" },
        borderWidth: { unit: "px", value: tier.highlight ? 2 : 1 },
        borderStyle: { keyword: "solid" },
        borderColor: tier.highlight ? { token: "color.primary" } : { token: "color.border" },
        display: { keyword: "flex" },
        flexDirection: { keyword: "column" },
        gap: { unit: "px", value: 16 },
      }
    );

    b.addElement(card, "Heading", "Tier Name", { text: tier.name, level: 3 }, { fontSize: { unit: "px", value: 22 }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Heading", "Tier Price", { text: `${tier.price}/month`, level: 2 }, { fontSize: { unit: "px", value: 32 }, fontWeight: { keyword: "bold" }, color: { token: "color.primary" } });
    b.addElement(card, "Text", "Tier Description", { text: tier.desc }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });

    b.addElement(
      card,
      "Button",
      "Tier CTA",
      { text: tier.cta, href: "/#", variant: tier.highlight ? "primary" : "secondary" },
      {
        backgroundColor: tier.highlight ? { token: "color.primary" } : { token: "color.secondary" },
        color: tier.highlight ? { token: "color.primaryForeground" } : { token: "color.secondaryForeground" },
        paddingTop: { unit: "px", value: 12 },
        paddingBottom: { unit: "px", value: 12 },
        borderRadius: { token: "radius.md" },
        textAlign: { keyword: "center" },
        fontWeight: { keyword: "bold" },
        marginTop: { keyword: "auto" },
      }
    );
  }

  b.addFooter(pricingBody, "Apex Cloud", "The next-generation developer cloud.", [
    { text: "Home", href: "/" },
    { text: "Pricing", href: "/pricing" },
  ]);

  return b.build();
}

export const saasLandingTemplate: TemplateDefinition = {
  id: "tmpl_saas_landing",
  slug: "saas-landing",
  name: "Apex SaaS",
  category: "SaaS",
  description: "High-converting modern landing page for software products, developer tools, and cloud services with feature showcase and pricing tiers.",
  tags: ["saas", "software", "startup", "dark-mode", "pricing"],
  preview: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80",
  pageCount: 2,
  style: "modern-tech",
  document: buildSaasLandingDoc(),
};
