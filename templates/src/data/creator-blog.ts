import { TemplateDocumentBuilder } from "../builder.js";
import type { TemplateDefinition } from "../types.js";

function buildCreatorDoc() {
  const b = new TemplateDocumentBuilder(
    "The Modern Craftsman",
    {
      colors: {
        "color.primary": "#4f46e5",
        "color.primaryForeground": "#ffffff",
        "color.secondary": "#f1f5f9",
        "color.secondaryForeground": "#1e293b",
        "color.accent": "#6366f1",
        "color.accentForeground": "#ffffff",
        "color.background": "#f8fafc",
        "color.surface": "#ffffff",
        "color.text": "#0f172a",
        "color.textMuted": "#64748b",
        "color.border": "#e2e8f0",
      },
      fonts: {
        heading: "Georgia, 'Times New Roman', serif",
        body: "Inter, system-ui, sans-serif",
      },
    },
    "blog"
  );

  // --- Page 1: Home (/) ---
  const { bodyId: homeBody } = b.addPage("Home", "/", {
    title: "The Modern Craftsman — Essays on Software & Design",
    description: "A weekly publication on engineering architecture, product clarity, and independent software.",
  });

  b.addNavbar(
    homeBody,
    "The Modern Craftsman",
    [
      { text: "Articles", href: "/articles" },
      { text: "About", href: "/about" },
    ],
    { text: "Subscribe", href: "/#newsletter" }
  );

  // Hero Section
  const heroSec = b.addElement(homeBody, "Section", "Hero Section", {}, { paddingTop: { unit: "px", value: 96 }, paddingBottom: { unit: "px", value: 72 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const heroContainer = b.addElement(heroSec, "Container", "Hero Container", {}, { maxWidth: { unit: "px", value: 780 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 24 } });

  const bioRow = b.addElement(heroContainer, "Box", "Author Bio Row", {}, { display: { keyword: "flex" }, alignItems: { keyword: "center" }, gap: { unit: "px", value: 20 } });
  b.addElement(bioRow, "Image", "Author Avatar", { src: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80", alt: "Julian Vance author portrait" }, { width: { unit: "px", value: 72 }, height: { unit: "px", value: 72 }, borderRadius: { token: "radius.full" }, objectFit: { keyword: "cover" } });
  const bioText = b.addElement(bioRow, "Box", "Bio Text", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 4 } });
  b.addElement(bioText, "Heading", "Author Name", { text: "Julian Vance", level: 3 }, { fontSize: { unit: "px", value: 20 }, fontWeight: { keyword: "bold" } });
  b.addElement(bioText, "Text", "Author Title", { text: "Software architect & writer based in San Francisco" }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" } });

  b.addElement(heroContainer, "Heading", "Hero Statement", { text: "Thoughts on engineering craft, product clarity, and independent software.", level: 1 }, { fontSize: { unit: "px", value: 44 }, fontWeight: { keyword: "bold" }, lineHeight: { keyword: "tight" } }, { fontSize: { unit: "px", value: 32 } });
  b.addElement(heroContainer, "Text", "Hero Subtext", { text: "A weekly publication read by over 18,000 founders, lead engineers, and product designers building things that matter." }, { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });

  // Featured Article Card
  const featSec = b.addElement(homeBody, "Section", "Featured Essay Section", {}, { paddingTop: { unit: "px", value: 32 }, paddingBottom: { unit: "px", value: 64 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const featContainer = b.addElement(featSec, "Container", "Featured Container", {}, { maxWidth: { unit: "px", value: 780 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });

  const featCard = b.addElement(featContainer, "Box", "Featured Essay Card", {}, { padding: { unit: "px", value: 40 }, backgroundColor: { token: "color.surface" }, borderRadius: { token: "radius.lg" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderColor: { token: "color.border" }, display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 16 } });
  b.addElement(featCard, "Text", "Essay Metadata", { text: "FEATURED ESSAY · 8 MIN READ" }, { fontSize: { unit: "px", value: 12 }, fontWeight: { keyword: "bold" }, color: { token: "color.primary" }, letterSpacing: { unit: "px", value: 1 } });
  b.addElement(featCard, "Heading", "Essay Title", { text: "The Architecture of Long-Lived Software Systems", level: 2 }, { fontSize: { unit: "px", value: 32 }, fontWeight: { keyword: "bold" } });
  b.addElement(featCard, "Text", "Essay Excerpt", { text: "Why data trees, pure state transitions, and strict operational boundaries outlive hype cycles, monolithic frameworks, and premature abstractions." }, { fontSize: { unit: "px", value: 16 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });
  b.addElement(featCard, "Link", "Read Link", { text: "Read full essay →", href: "/articles" }, { color: { token: "color.primary" }, fontWeight: { keyword: "bold" }, fontSize: { unit: "px", value: 15 } });

  // Newsletter Section
  const newsSec = b.addElement(homeBody, "Section", "Newsletter Box", {}, { paddingTop: { unit: "px", value: 48 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const newsContainer = b.addElement(newsSec, "Container", "Newsletter Container", {}, { maxWidth: { unit: "px", value: 780 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, backgroundColor: { token: "color.surface" }, padding: { unit: "px", value: 40 }, borderRadius: { token: "radius.lg" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderColor: { token: "color.border" }, textAlign: { keyword: "center" } });
  b.addElement(newsContainer, "Heading", "Newsletter Heading", { text: "Delivered to your inbox every Sunday morning.", level: 3 }, { fontSize: { unit: "px", value: 24 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 8 } });
  b.addElement(newsContainer, "Text", "Newsletter Details", { text: "No spam, no sponsored promotions. Unsubscribe at any time with one click." }, { fontSize: { unit: "px", value: 15 }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 24 } });

  const newsForm = b.addElement(newsContainer, "Form", "Subscription Form", { name: "Creator Newsletter", method: "POST" }, { display: { keyword: "flex" }, gap: { unit: "px", value: 12 }, justifyContent: { keyword: "center" } }, { flexDirection: { keyword: "column" } });
  b.addElement(newsForm, "Input", "Email Field", { name: "email", placeholder: "you@example.com", type: "email", required: true }, { padding: { unit: "px", value: 12 }, width: { unit: "px", value: 280 }, backgroundColor: { token: "color.background" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(newsForm, "Submit", "Join Button", { text: "Join 18,000+ Readers" }, { padding: { unit: "px", value: 12 }, paddingLeft: { unit: "px", value: 20 }, paddingRight: { unit: "px", value: 20 }, backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, borderRadius: { token: "radius.md" }, fontWeight: { keyword: "bold" } });

  b.addFooter(homeBody, "The Modern Craftsman", "Independent writing by Julian Vance.", [
    { text: "Home", href: "/" },
    { text: "Articles", href: "/articles" },
    { text: "About", href: "/about" },
  ]);

  // --- Page 2: Articles (/articles) ---
  const { bodyId: articlesBody } = b.addPage("Articles", "/articles", {
    title: "Essay Archive — The Modern Craftsman",
    description: "Browse the complete collection of essays on software craft, system architecture, and tools.",
  });

  b.addNavbar(
    articlesBody,
    "The Modern Craftsman",
    [
      { text: "Articles", href: "/articles" },
      { text: "About", href: "/about" },
    ],
    { text: "Subscribe", href: "/#newsletter" }
  );

  const archiveSec = b.addElement(articlesBody, "Section", "Articles List Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const archiveContainer = b.addElement(archiveSec, "Container", "Archive Container", {}, { maxWidth: { unit: "px", value: 780 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(archiveContainer, "Heading", "Archive Title", { text: "All Articles & Essays", level: 1 }, { fontSize: { unit: "px", value: 44 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 48 } });

  const essays = [
    { title: "The Architecture of Long-Lived Software Systems", date: "October 2026", length: "8 min read", excerpt: "Why data trees, pure state transitions, and strict operational boundaries outlive hype cycles." },
    { title: "Designing Tools for High Agency Creators", date: "August 2026", length: "6 min read", excerpt: "The difference between software that empowers experts versus software that constrains them." },
    { title: "In Praise of Boring Protocols", date: "May 2026", length: "10 min read", excerpt: "HTTP, JSON, SQL, and TCP continue to win every platform transition. Here is why." },
  ];

  for (const e of essays) {
    const row = b.addElement(archiveContainer, "Box", "Article Entry", {}, { paddingBottom: { unit: "px", value: 32 }, marginBottom: { unit: "px", value: 32 }, borderBottomWidth: { unit: "px", value: 1 }, borderBottomStyle: { keyword: "solid" }, borderBottomColor: { token: "color.border" }, display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 8 } });
    b.addElement(row, "Text", "Article Date", { text: `${e.date} · ${e.length}` }, { fontSize: { unit: "px", value: 13 }, color: { token: "color.textMuted" } });
    b.addElement(row, "Heading", "Article Heading", { text: e.title, level: 3 }, { fontSize: { unit: "px", value: 22 }, fontWeight: { keyword: "bold" } });
    b.addElement(row, "Text", "Article Excerpt", { text: e.excerpt }, { fontSize: { unit: "px", value: 15 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });
  }

  b.addFooter(articlesBody, "The Modern Craftsman", "Independent writing by Julian Vance.", [
    { text: "Home", href: "/" },
    { text: "Articles", href: "/articles" },
    { text: "About", href: "/about" },
  ]);

  // --- Page 3: About (/about) ---
  const { bodyId: aboutBody } = b.addPage("About", "/about", {
    title: "About — The Modern Craftsman",
    description: "Learn more about Julian Vance, author of The Modern Craftsman publication.",
  });

  b.addNavbar(
    aboutBody,
    "The Modern Craftsman",
    [
      { text: "Articles", href: "/articles" },
      { text: "About", href: "/about" },
    ],
    { text: "Subscribe", href: "/#newsletter" }
  );

  const aboutSec = b.addElement(aboutBody, "Section", "About Essay Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const aboutContainer = b.addElement(aboutSec, "Container", "About Container", {}, { maxWidth: { unit: "px", value: 720 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" }, display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 24 } });
  b.addElement(aboutContainer, "Heading", "About Heading", { text: "About the Publication", level: 1 }, { fontSize: { unit: "px", value: 44 }, fontWeight: { keyword: "bold" } });
  b.addElement(aboutContainer, "Text", "About Paragraph 1", { text: "The Modern Craftsman is an essay series exploring software architecture, design tools, and the craft of computing. I believe great software is not born from frameworks, but from clarity of thought, reverence for fundamentals, and deep respect for the user." }, { fontSize: { unit: "px", value: 18 }, lineHeight: { keyword: "relaxed" }, color: { token: "color.textMuted" } });
  b.addElement(aboutContainer, "Text", "About Paragraph 2", { text: "I have spent the past fifteen years building developer infrastructure, visual editors, and distributed systems. When not writing or programming, I advise early-stage founders and mentor engineering apprentices." }, { fontSize: { unit: "px", value: 18 }, lineHeight: { keyword: "relaxed" }, color: { token: "color.textMuted" } });

  b.addFooter(aboutBody, "The Modern Craftsman", "Independent writing by Julian Vance.", [
    { text: "Home", href: "/" },
    { text: "Articles", href: "/articles" },
    { text: "About", href: "/about" },
  ]);

  return b.build();
}

export const creatorBlogTemplate: TemplateDefinition = {
  id: "tmpl_creator_blog",
  slug: "creator-blog",
  name: "The Modern Craftsman",
  category: "Creator",
  description: "Clean, distraction-free personal publication and blog for engineers, designers, and essayists with archive and newsletter capture.",
  tags: ["blog", "creator", "newsletter", "writing", "editorial", "minimal"],
  preview: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80",
  pageCount: 3,
  style: "minimal-editorial",
  document: buildCreatorDoc(),
};
