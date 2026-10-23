import { TemplateDocumentBuilder } from "../builder.js";
import type { TemplateDefinition } from "../types.js";

function buildRestaurantDoc() {
  const b = new TemplateDocumentBuilder(
    "L'Artisan Bistro & Cafe",
    {
      colors: {
        "color.primary": "#b45309",
        "color.primaryForeground": "#ffffff",
        "color.secondary": "#fef3c7",
        "color.secondaryForeground": "#78350f",
        "color.accent": "#d97706",
        "color.accentForeground": "#ffffff",
        "color.background": "#fdfbf7",
        "color.surface": "#ffffff",
        "color.text": "#292524",
        "color.textMuted": "#78716c",
        "color.border": "#e7e5e4",
      },
      fonts: {
        heading: "Georgia, 'Times New Roman', serif",
        body: "Inter, system-ui, sans-serif",
      },
    },
    "dining"
  );

  // --- Page 1: Home (/) ---
  const { bodyId: homeBody } = b.addPage("Home", "/", {
    title: "L'Artisan Bistro & Cafe — Artisan Roasted, Farm-to-Table",
    description: "Experience handcrafted European pastries, specialty coffee, and seasonal farm-fresh entrees.",
  });

  b.addNavbar(
    homeBody,
    "L'Artisan Bistro",
    [
      { text: "Menu", href: "/menu" },
      { text: "Reservations", href: "/reservations" },
    ],
    { text: "Book Table", href: "/reservations" }
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
      maxWidth: { unit: "px", value: 800 },
      marginLeft: { keyword: "auto" },
      marginRight: { keyword: "auto" },
      display: { keyword: "flex" },
      flexDirection: { keyword: "column" },
      alignItems: { keyword: "center" },
      gap: { unit: "px", value: 20 },
    }
  );

  b.addElement(heroContainer, "Text", "Hero Tagline", { text: "ESTABLISHED 2018 · SOHO, NEW YORK" }, { fontSize: { unit: "px", value: 13 }, letterSpacing: { unit: "px", value: 2 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" } });
  b.addElement(
    heroContainer,
    "Heading",
    "Hero Title",
    { text: "Crafted with passion, gathered with love.", level: 1 },
    { fontSize: { unit: "px", value: 54 }, fontWeight: { keyword: "bold" }, color: { token: "color.text" } },
    { fontSize: { unit: "px", value: 36 } }
  );
  b.addElement(
    heroContainer,
    "Text",
    "Hero Description",
    { text: "Artisan sourdough, rare micro-lot pour-overs, and seasonal wood-fired entrees crafted from ingredients gathered daily from local regenerative farms." },
    { fontSize: { unit: "px", value: 18 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } }
  );

  const heroCtaBox = b.addElement(heroContainer, "Box", "Hero Buttons", {}, { display: { keyword: "flex" }, gap: { unit: "px", value: 16 }, marginTop: { unit: "px", value: 12 } });
  b.addElement(
    heroCtaBox,
    "Button",
    "Menu Button",
    { text: "View Seasonal Menu", href: "/menu", variant: "primary" },
    {
      backgroundColor: { token: "color.primary" },
      color: { token: "color.primaryForeground" },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      paddingTop: { unit: "px", value: 12 },
      paddingBottom: { unit: "px", value: 12 },
      borderRadius: { token: "radius.md" },
      fontWeight: { keyword: "bold" },
    }
  );
  b.addElement(
    heroCtaBox,
    "Button",
    "Reserve Button",
    { text: "Reserve a Table", href: "/reservations", variant: "secondary" },
    {
      backgroundColor: { token: "color.secondary" },
      color: { token: "color.secondaryForeground" },
      paddingLeft: { unit: "px", value: 24 },
      paddingRight: { unit: "px", value: 24 },
      paddingTop: { unit: "px", value: 12 },
      paddingBottom: { unit: "px", value: 12 },
      borderRadius: { token: "radius.md" },
      fontWeight: { keyword: "bold" },
    }
  );

  b.addElement(
    heroContainer,
    "Image",
    "Hero Atmosphere Photo",
    { src: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80", alt: "Warm interior dining room of L'Artisan Bistro with rustic wooden tables" },
    { width: { unit: "%", value: 100 }, height: { unit: "px", value: 420 }, objectFit: { keyword: "cover" }, borderRadius: { token: "radius.lg" }, marginTop: { unit: "px", value: 24 } }
  );

  // Featured Specials
  const specSec = b.addElement(
    homeBody,
    "Section",
    "Specials Section",
    {},
    { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 }, backgroundColor: { token: "color.surface" } }
  );
  const specContainer = b.addElement(specSec, "Container", "Specials Container", {}, { maxWidth: { unit: "px", value: 1100 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(specContainer, "Heading", "Specials Title", { text: "Today's Chef Highlights", level: 2 }, { fontSize: { unit: "px", value: 36 }, textAlign: { keyword: "center" }, marginBottom: { unit: "px", value: 48 } });

  const specGrid = b.addElement(specContainer, "Box", "Specials Grid", {}, { display: { keyword: "grid" }, gridTemplateColumns: { keyword: "repeat(3, 1fr)" }, gap: { unit: "px", value: 32 } }, { gridTemplateColumns: { keyword: "1fr" } });
  const dishes = [
    { name: "Black Truffle Tagliatelle", desc: "Handmade egg pasta with cultured butter, parmigiano reggiano, and shaved Norcia black winter truffle.", price: "$32" },
    { name: "Wood-Fired Branzino", desc: "Mediterranean sea bass with Meyer lemon confit, braised wild fennel, and cold-pressed olive oil.", price: "$38" },
    { name: "Valrhona Chocolate Tart", desc: "Smoked sea salt caramel, dark chocolate ganache, and Madagascar vanilla bean gelato.", price: "$16" },
  ];
  for (const d of dishes) {
    const card = b.addElement(specGrid, "Box", "Dish Card", {}, { padding: { unit: "px", value: 28 }, backgroundColor: { token: "color.background" }, borderRadius: { token: "radius.lg" }, borderStyle: { keyword: "solid" }, borderWidth: { unit: "px", value: 1 }, borderColor: { token: "color.border" } });
    b.addElement(card, "Heading", "Dish Name", { text: d.name, level: 3 }, { fontSize: { unit: "px", value: 20 }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 8 } });
    b.addElement(card, "Text", "Dish Price", { text: d.price }, { fontSize: { unit: "px", value: 16 }, color: { token: "color.primary" }, fontWeight: { keyword: "bold" }, marginBottom: { unit: "px", value: 8 } });
    b.addElement(card, "Text", "Dish Description", { text: d.desc }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" }, lineHeight: { keyword: "relaxed" } });
  }

  b.addFooter(homeBody, "L'Artisan Bistro & Cafe", "Artisan culinary craft in the heart of SoHo.", [
    { text: "Home", href: "/" },
    { text: "Menu", href: "/menu" },
    { text: "Reservations", href: "/reservations" },
  ]);

  // --- Page 2: Menu (/menu) ---
  const { bodyId: menuBody } = b.addPage("Menu", "/menu", {
    title: "Seasonal Menu — L'Artisan Bistro & Cafe",
    description: "Browse our farm-to-table lunch, dinner, and dessert selections.",
  });

  b.addNavbar(
    menuBody,
    "L'Artisan Bistro",
    [
      { text: "Menu", href: "/menu" },
      { text: "Reservations", href: "/reservations" },
    ],
    { text: "Book Table", href: "/reservations" }
  );

  const menuSec = b.addElement(menuBody, "Section", "Menu Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const menuContainer = b.addElement(menuSec, "Container", "Menu Container", {}, { maxWidth: { unit: "px", value: 800 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });
  b.addElement(menuContainer, "Heading", "Menu Title", { text: "Seasonal Dining Menu", level: 1 }, { fontSize: { unit: "px", value: 48 }, textAlign: { keyword: "center" }, marginBottom: { unit: "px", value: 16 } });
  b.addElement(menuContainer, "Text", "Menu Subtitle", { text: "Ingredients updated weekly according to local market harvests." }, { fontSize: { unit: "px", value: 16 }, textAlign: { keyword: "center" }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 48 } });

  for (const d of dishes) {
    const row = b.addElement(menuContainer, "Box", "Menu Item Row", {}, { display: { keyword: "flex" }, justifyContent: { keyword: "space-between" }, paddingBottom: { unit: "px", value: 24 }, marginBottom: { unit: "px", value: 24 }, borderBottomWidth: { unit: "px", value: 1 }, borderBottomStyle: { keyword: "solid" }, borderBottomColor: { token: "color.border" } });
    const col = b.addElement(row, "Box", "Menu Item Info", {}, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 4 } });
    b.addElement(col, "Heading", "Item Title", { text: d.name, level: 3 }, { fontSize: { unit: "px", value: 20 }, fontWeight: { keyword: "bold" } });
    b.addElement(col, "Text", "Item Description", { text: d.desc }, { fontSize: { unit: "px", value: 14 }, color: { token: "color.textMuted" } });
    b.addElement(row, "Text", "Item Price", { text: d.price }, { fontSize: { unit: "px", value: 18 }, fontWeight: { keyword: "bold" }, color: { token: "color.primary" } });
  }

  b.addFooter(menuBody, "L'Artisan Bistro & Cafe", "Artisan culinary craft in the heart of SoHo.", [
    { text: "Home", href: "/" },
    { text: "Menu", href: "/menu" },
    { text: "Reservations", href: "/reservations" },
  ]);

  // --- Page 3: Reservations (/reservations) ---
  const { bodyId: resBody } = b.addPage("Reservations", "/reservations", {
    title: "Table Reservations — L'Artisan Bistro & Cafe",
    description: "Book your table online for lunch, weekend brunch, or dinner.",
  });

  b.addNavbar(
    resBody,
    "L'Artisan Bistro",
    [
      { text: "Menu", href: "/menu" },
      { text: "Reservations", href: "/reservations" },
    ],
    { text: "Book Table", href: "/reservations" }
  );

  const resSec = b.addElement(resBody, "Section", "Reservation Section", {}, { paddingTop: { unit: "px", value: 80 }, paddingBottom: { unit: "px", value: 80 }, paddingLeft: { unit: "px", value: 24 }, paddingRight: { unit: "px", value: 24 } });
  const resContainer = b.addElement(resSec, "Container", "Reservation Container", {}, { maxWidth: { unit: "px", value: 680 }, marginLeft: { keyword: "auto" }, marginRight: { keyword: "auto" } });

  b.addElement(resContainer, "Heading", "Reservation Heading", { text: "Reserve a Table", level: 1 }, { fontSize: { unit: "px", value: 44 }, textAlign: { keyword: "center" }, marginBottom: { unit: "px", value: 16 } });
  b.addElement(resContainer, "Text", "Reservation Subtitle", { text: "For parties larger than 6 guests, please contact our events coordinator directly." }, { fontSize: { unit: "px", value: 16 }, textAlign: { keyword: "center" }, color: { token: "color.textMuted" }, marginBottom: { unit: "px", value: 40 } });

  const resForm = b.addElement(resContainer, "Form", "Dining Reservation Form", { name: "Table Booking", method: "POST" }, { display: { keyword: "flex" }, flexDirection: { keyword: "column" }, gap: { unit: "px", value: 20 } });
  b.addElement(resForm, "Input", "Name Input", { name: "name", placeholder: "Primary Guest Name", type: "text", required: true }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(resForm, "Input", "Email Input", { name: "email", placeholder: "Confirmation Email", type: "email", required: true }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(resForm, "Input", "Party Size", { name: "partySize", placeholder: "Party Size (e.g. 2 guests)", type: "text", required: true }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(resForm, "Textarea", "Dietary Notes", { name: "notes", placeholder: "Special occasions, seating preference, or dietary allergies...", rows: 4 }, { padding: { unit: "px", value: 14 }, backgroundColor: { token: "color.surface" }, borderColor: { token: "color.border" }, borderWidth: { unit: "px", value: 1 }, borderStyle: { keyword: "solid" }, borderRadius: { token: "radius.md" } });
  b.addElement(resForm, "Submit", "Submit Reservation", { text: "Confirm Reservation Request" }, { padding: { unit: "px", value: 16 }, backgroundColor: { token: "color.primary" }, color: { token: "color.primaryForeground" }, borderRadius: { token: "radius.md" }, fontWeight: { keyword: "bold" }, fontSize: { unit: "px", value: 16 } });

  b.addFooter(resBody, "L'Artisan Bistro & Cafe", "Artisan culinary craft in the heart of SoHo.", [
    { text: "Home", href: "/" },
    { text: "Menu", href: "/menu" },
    { text: "Reservations", href: "/reservations" },
  ]);

  return b.build();
}

export const restaurantCafeTemplate: TemplateDefinition = {
  id: "tmpl_restaurant_cafe",
  slug: "restaurant-cafe",
  name: "L'Artisan Bistro & Cafe",
  category: "Restaurant",
  description: "Warm, artisanal culinary website for bistros, cafes, and fine dining with menu showcases and reservation booking.",
  tags: ["restaurant", "cafe", "food", "dining", "menu", "reservations"],
  preview: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
  pageCount: 3,
  style: "warm-artisan",
  document: buildRestaurantDoc(),
};
