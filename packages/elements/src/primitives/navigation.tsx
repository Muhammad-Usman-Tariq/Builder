import { z } from "zod";
import type { ElementDefinition } from "../types/index.js";

// 12. Navbar
export const navbarPropsSchema = z.object({
  brandText: z.string().default("Brand"),
  logoSrc: z.string().optional(),
});
export type NavbarProps = z.infer<typeof navbarPropsSchema>;

export const navbarDefinition: ElementDefinition<NavbarProps> = {
  type: "Navbar",
  label: "Navbar",
  icon: "navigation",
  category: "interactive",
  propsSchema: navbarPropsSchema,
  defaultProps: { brandText: "Brand" },
  defaultStyle: {
    display: { keyword: "flex" },
    alignItems: { keyword: "center" },
    justifyContent: { keyword: "space-between" },
    width: { unit: "%", value: 100 },
    padding: { unit: "px", value: 16 },
    borderBottom: { keyword: "1px solid var(--color-border, #e2e8f0)" },
    background: { token: "color.background" },
  },
  canHaveChildren: true,
  controls: [
    { id: "brandText", label: "Brand Name", type: "text", defaultValue: "Brand" },
    { id: "logoSrc", label: "Logo URL (optional)", type: "image" },
  ],
  render: (props, ctx) => {
    return (
      <nav
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Navbar"
        className={ctx.className}
        style={ctx.style}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
          {props.logoSrc && (
            <img src={props.logoSrc} alt={props.brandText} style={{ height: "32px", width: "auto" }} />
          )}
          <span>{props.brandText}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>{ctx.children}</div>
      </nav>
    );
  },
  aiHint: "Header navigation bar with brand logo and navigational links.",
};
