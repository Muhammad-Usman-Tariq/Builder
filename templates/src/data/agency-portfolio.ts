import { TemplateDocumentBuilder } from "../builder.js";
import type { TemplateDefinition } from "../types.js";

function buildAgencyDoc() {
  const b = new TemplateDocumentBuilder(
    "Vanguard Studio",
    {
      colors: {
        "color.primary": "#8b5cf6",
        "color.primaryForeground": "#ffffff",
        "color.secondary": "#27272a",
        "color.secondaryForeground": "#fafafa",
        "color.accent": "#a78bfa",
        "color.accentForeground": "#09090b",
        "color.background": "#09090b",
        "color.surface": "#141417",
        "color.text": "#fafafa",
        "color.textMuted": "#a1a1aa",
        "color.border": "#27272a",
      },
      fonts: {
        heading: "Plus Jakarta Sans, sans-serif",
        body: "Inter, sans-serif",
      },
    },
    "agency"
  );

  // --- Page 1: Home (/) ---
  const { bodyId: homeBody } = b.addPage("Home", "/", {
    title: "Vanguard Studio — Digital Design & Art Direction",
    description: "Award-winning creative studio crafting digital brand identities and modern web platforms.",
  });

  b.addNavbar(
    homeBody,
    "Vanguard Studio",
    [
      { text: "Work", href: "/work" },
      { text: "Contact", href: "/contact" },
    ],
    { text: "Start a Project", href: "/contact" }
  );

  // Hero Section
  const heroSec = b.addElement(
    homeBody,
    "Section",
    "Hero Section",
    {},
    {
      paddingTop: { unit: "px", value: 112 },
      paddingBottom: { unit: "px", value: 96 },
      paddingLeft: { unit: "px", value: 32 },
      paddingRight: { unit: "px", value: 32 },
    }
  );

  const heroContainer = b.addElement(
    heroSec,
    "Container",
    "Hero Container",
    {},
    {
      maxWidth: { unit: "px", value: 1100 },
      marginLeft: { keyword: "auto" },
      marginRight: { keyword: "auto" },
      display: { keyword: "flex" },
      flexDirection: { keyword: "column" },
      gap: { unit: "px", value: 24 },
    }
  );

  b.addElement(
    heroContainer,
    "Heading",
    "Agency Statement",
    { text: "We craft digital experiences that redefine global brands.", level: 1 },
    {
      fontSize: { unit: "px", value: 64 },
      fontWeight: { keyword: "bold" },
      lineHeight: { keyword: "tight" },
      color: { token: "color.text" },
      letterSpacing: { unit: "px", value: -1 },
    },
    {
      fontSize: { unit: "px", value: 40 },
    }
  );

  b.addElement(
    heroContainer,
    "Text",
    "Hero Ethos",
    {
      text: "Vanguard is an independent design and technology consultancy based in Zurich & New York. We partner with visionaries to create iconic products, websites, and identities that stand out.",
    },
    {
      fontSize: { unit: "px", value: 20 },
      color: { token: "color.textMuted" },
      maxWidth: { unit: "px", value: 720 },
      lineHeight: { keyword: "relaxed" },
    }
  );

  const heroCtaBox = b.addElement(heroContainer, "Box", "Hero CTA Row", {}, { display: { keyword: "flex" }, gap: { unit: "px", value: 16 }, marginTop: { unit: "px", value: 16 } });
  b.addElement(
    heroCtaBox,
    "Button",
    "View Work Button",
    { text: "Explore Selected Work", href: "/work", variant: "primary" },
    {
      backgroundColor: { token: "color.primary" },
      color: { token: "color.primaryForeground" },
      paddingLeft: { unit: "px", value: 28 },
      paddingRight: { unit: "px", value: 28 },
      paddingTop: { unit: "px", value: 14 },
      paddingBottom: { unit: "px", value: 14 },
      borderRadius: { token: "radius.full" },
      fontWeight: { keyword: "bold" },
    }
  );

  // Selected Works Grid
  const workSec = b.addElement(
    homeBody,
    "Section",
    "Works Showcase Section",
    {},
    {
      paddingTop: { unit: "px", value: 80 },
      paddingBottom: { unit: "px", value: 96 },
      paddingLeft: { unit: "px", value: 32 },
      paddingRight: { unit: "px", value: 32 },
      backgroundColor: { token: "color.surface" },
    }
  );

  const workContainer = b.addElement(workSec, "Container", "Work Container", {}, { maxWidth: { unit: "px", value: 1200 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(
    workContainer,
    "Heading",
    "Works Heading",
    { text: "Selected Case Studies", level: 2 },
    { fontSize: { unit: "px", value: 36 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 48 } }
  );

  const worksGrid = b.addElement(
    workContainer,
    "Box",
    "Projects Grid",
    {},
    { display: { keyword: "grid" }, gridTemplateColumns: { keyword: "repeat(2, 1fr)" }, gap: { unit: "px", value: 40 } },
    { gridTemplateColumns: { keyword: "1fr" } }
  );

  const projects = [
    {
      title: "Solstice AI — Autonomous Creative Suite",
      cat: "Brand Identity & Product Design",
      img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
    },
    {
      title: "Aura Audio — Spatial Sound Experience",
      cat: "E-Commerce & 3D Interactive Web",
      img: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=800&q=80",
    },
  ];

  for (const p of projects) {
    const card = b.addElement(worksGrid, "Box", "Project Card", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 16 } });
    b.addElement(
      card,
      "Image",
      "Project Image",
      { src: p.img, alt: `${p.title} case study screenshot` },
      { width: { unit: "%", value: 100 }, height: { unit: "px", value: 360 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.lg" } }
    );
    b.addElement(card, "Text", "Category Tag", { text: p.cat }, { fontSize: { unit: "px", value: 13 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" } });
    b.addElement(card, "Heading", "Project Title", { text: p.title, level: 3 }, { fontSize: { unit: "px", value: 24 }, fontWeight: { keyword: "bold" } });
  }

  b.addFooter(homeBody, "Vanguard Studio", "Independent design and technology consultancy.", [
    { text: "Home", href: "/" },
    { text: "Work", href: "/work" },
    { text: "Contact", href: "/contact" },
  ]);

  // --- Page 2: Work (/work) ---
  const { bodyId: workBody } = b.addPage("Work", "/work", {
    title: "Portfolio & Case Studies — Vanguard Studio",
    description: "Browse our complete archive of design systems, digital products, and brand transformations.",
  });

  b.addNavbar(
    workBody,
    "Vanguard Studio",
    [
      { text: "Work", href: "/work" },
      { text: "Contact", href: "/contact" },
    ],
    { text: "Start a Project", href: "/contact" }
  );

  const archiveSec = b.addElement(workBody, "Section", "Work Archive Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 32 }, paddingRight: { unit: "px", value: 32 } });
  const archiveContainer = b.addElement(archiveSec, "Container", "Archive Container", {}, { maxWidth: { unit: "px", value: 1200 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(archiveContainer, "Heading", "Archive Title", { text: "Our Work", level: 1 }, { fontSize: { unit: "px", value: 48 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 16 } });
  b.addElement(archiveContainer, "Text", "Archive Subtitle", { text: "Explore how we solve complex challenges with daring design and world-class engineering." }, { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 48 } });

  const archiveGrid = b.addElement(archiveContainer, "Box", "Archive Grid", {}, { display: { keyword: "grid" }, gridTemplateColumns: { keyword: "repeat(2, 1fr)" }, gap: { unit: "px", value: 40 } }, { gridTemplateColumns: { keyword: "1fr" } });
  for (const p of projects) {
    const card = b.addElement(archiveGrid, "Box", "Archive Card", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 16 } });
    b.addElement(card, "Image", "Archive Item Image", { src: p.img, alt: `${p.title} visual archive preview` }, { width: { unit: "%", value: 100 }, height: { unit: "px", value: 320 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.lg" } });
    b.addElement(card, "Heading", "Archive Item Title", { text: p.title, level: 3 }, { fontSize: { unit: "px", value: 22 }, fontWeight: { keyword: "bold" } });
  }

  b.addFooter(workBody, "Vanguard Studio", "Independent design and technology consultancy.", [
    { text: "Home", href: "/" },
    { text: "Work", href: "/work" },
    { text: "Contact", href: "/contact" },
  ]);

  // --- Page 3: Contact (/contact) ---
  const { bodyId: contactBody } = b.addPage("Contact", "/contact", {
    title: "Contact & New Business — Vanguard Studio",
    description: "Get in touch with our team to discuss new commissions, collaborations, and consultations.",
  });

  b.addNavbar(
    contactBody,
    "Vanguard Studio",
    [
      { text: "Work", href: "/work" },
      { text: "Contact", href: "/contact" },
    ],
    { text: "Start a Project", href: "/contact" }
  );

  const contactSec = b.addElement(contactBody, "Section", "Contact Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 32 }, paddingRight: { unit: "px", value: 32 } });
  const contactContainer = b.addElement(contactSec, "Container", "Contact Container", {}, { maxWidth: { unit: "px", value: 800 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });

  b.addElement(contactContainer, "Heading", "Contact Title", { text: "Let's create something extraordinary", level: 1 }, { fontSize: { unit: "px", value: 48 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 16 } });
  b.addElement(contactContainer, "Text", "Contact Description", { text: "We accept a limited number of high-impact commissions each quarter. Fill out the brief below and we will respond within 24 hours." }, { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 40 } });

  // Contact Form
  const formBox = b.addElement(contactContainer, "Form", "Agency Inquiry Form", { name: "Project Inquiry", method: "POST" }, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 20 } });
  b.addElement(formBox, "Input", "Name Input", { name: "name", placeholder: "Your Name", type: "text", required: true }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" }, color: { token: "color.text" } });
  b.addElement(formBox, "Input", "Email Input", { name: "email", placeholder: "Work Email Address", type: "email", required: true }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" }, color: { token: "color.text" } });
  b.addElement(formBox, "Textarea", "Message Input", { name: "message", placeholder: "Tell us about your project, timeline, and estimated budget...", rows: 5 }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" }, color: { token: "color.text" } });
  b.addElement(formBox, "Submit", "Submit Button", { text: "Send Project Inquiry" }, { padding: { unit: "px", value: 16 }, backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, borderRadius: { token: "radius.md" }, fontWeight: { keyword: "bold" }, fontSize: { unit: "px", value: 16 } });

  b.addFooter(contactBody, "Vanguard Studio", "Independent design and technology consultancy.", [
    { text: "Home", href: "/" },
    { text: "Work", href: "/work" },
    { text: "Contact", href: "/contact" },
  ]);

  return b.build();
}

export const agencyPortfolioTemplate: TemplateDefinition = {
  id: "tmpl_agency_portfolio",
  slug: "agency-portfolio",
  name: "Vanguard Studio",
  category: "Agency",
  description: "Bold, modern agency portfolio showcasing client case studies, digital creative services, and inbound inquiries.",
  tags: ["agency", "portfolio", "creative", "design", "case-studies"],
  preview: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
  pageCount: 3,
  style: "editorial-bold",
  document: buildAgencyDoc(),
};
