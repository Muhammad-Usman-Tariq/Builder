import { z } from "zod";
import type { ElementDefinition } from "../types/index.js";

// 13. Form
export const formPropsSchema = z.object({
  formId: z.string().default("contact-form"),
  action: z.string().default("/api/public/forms"),
  method: z.enum(["POST", "GET"]).default("POST"),
});
export type FormProps = z.infer<typeof formPropsSchema>;

export const formDefinition: ElementDefinition<FormProps> = {
  type: "Form",
  label: "Form",
  icon: "file-plus",
  category: "form",
  propsSchema: formPropsSchema,
  defaultProps: {
    formId: "contact-form",
    action: "/api/public/forms",
    method: "POST",
  },
  defaultStyle: {
    display: { keyword: "flex" },
    flexDirection: { keyword: "column" },
    gap: { token: "space.4" },
    width: { unit: "%", value: 100 },
  },
  canHaveChildren: true,
  allowedChildren: ["Input", "Textarea", "Submit", "Box", "Container", "Text", "Heading"],
  controls: [
    { id: "formId", label: "Form ID", type: "text", defaultValue: "contact-form" },
    { id: "action", label: "Form Endpoint Action", type: "text", defaultValue: "/api/public/forms" },
  ],
  render: (props, ctx) => {
    return (
      <form
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Form"
        data-form-id={props.formId}
        action={props.action}
        method={props.method}
        className={ctx.className}
        style={ctx.style}
      >
        <input type="hidden" name="_formId" value={props.formId} />
        {ctx.children}
      </form>
    );
  },
  aiHint: "Interactive submission form for contact, inquiry, or newsletter capture.",
};

// 14. Input
export const inputPropsSchema = z.object({
  name: z.string().default("fieldName"),
  label: z.string().optional(),
  placeholder: z.string().default("Enter text..."),
  type: z.enum(["text", "email", "tel", "number", "url"]).default("text"),
  required: z.boolean().default(false),
});
export type InputProps = z.infer<typeof inputPropsSchema>;

export const inputDefinition: ElementDefinition<InputProps> = {
  type: "Input",
  label: "Text Input",
  icon: "edit-3",
  category: "form",
  propsSchema: inputPropsSchema,
  defaultProps: {
    name: "fieldName",
    placeholder: "Enter text...",
    type: "text",
    required: false,
  },
  defaultStyle: {
    padding: { unit: "px", value: 10 },
    borderRadius: { token: "radius.md" },
    border: { keyword: "1px solid var(--color-border, #e2e8f0)" },
    fontSize: { unit: "px", value: 14 },
    fontFamily: { keyword: "inherit" },
    width: { unit: "%", value: 100 },
    background: { token: "color.background" },
    color: { token: "color.text" },
  },
  canHaveChildren: false,
  allowedParents: ["Form", "Box", "Container", "Section"],
  controls: [
    { id: "name", label: "Field Name", type: "text", defaultValue: "fieldName" },
    { id: "label", label: "Label Text (optional)", type: "text" },
    { id: "placeholder", label: "Placeholder", type: "text", defaultValue: "Enter text..." },
    {
      id: "type",
      label: "Input Type",
      type: "select",
      options: [
        { label: "Text", value: "text" },
        { label: "Email", value: "email" },
        { label: "Phone", value: "tel" },
        { label: "Number", value: "number" },
      ],
      defaultValue: "text",
    },
    { id: "required", label: "Required", type: "boolean", defaultValue: false },
  ],
  render: (props, ctx) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
        {props.label && (
          <label style={{ fontSize: "14px", fontWeight: "500", fontFamily: "inherit" }}>
            {props.label} {props.required && <span style={{ color: "red" }}>*</span>}
          </label>
        )}
        <input
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Input"
          name={props.name}
          type={props.type}
          placeholder={props.placeholder}
          required={props.required}
          className={ctx.className}
          style={{ fontFamily: "inherit", ...ctx.style }}
        />
      </div>
    );
  },
  aiHint: "Single-line form input field.",
};

// 15. Textarea
export const textareaPropsSchema = z.object({
  name: z.string().default("message"),
  label: z.string().optional(),
  placeholder: z.string().default("Type your message..."),
  rows: z.number().default(4),
  required: z.boolean().default(false),
});
export type TextareaProps = z.infer<typeof textareaPropsSchema>;

export const textareaDefinition: ElementDefinition<TextareaProps> = {
  type: "Textarea",
  label: "Textarea",
  icon: "align-justify",
  category: "form",
  propsSchema: textareaPropsSchema,
  defaultProps: {
    name: "message",
    placeholder: "Type your message...",
    rows: 4,
    required: false,
  },
  defaultStyle: {
    padding: { unit: "px", value: 10 },
    borderRadius: { token: "radius.md" },
    border: { keyword: "1px solid var(--color-border, #e2e8f0)" },
    fontSize: { unit: "px", value: 14 },
    fontFamily: { keyword: "inherit" },
    width: { unit: "%", value: 100 },
    background: { token: "color.background" },
    color: { token: "color.text" },
  },
  canHaveChildren: false,
  allowedParents: ["Form", "Box", "Container", "Section"],
  controls: [
    { id: "name", label: "Field Name", type: "text", defaultValue: "message" },
    { id: "label", label: "Label Text (optional)", type: "text" },
    { id: "placeholder", label: "Placeholder", type: "text", defaultValue: "Type your message..." },
    { id: "rows", label: "Rows", type: "number", defaultValue: 4 },
    { id: "required", label: "Required", type: "boolean", defaultValue: false },
  ],
  render: (props, ctx) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
        {props.label && (
          <label style={{ fontSize: "14px", fontWeight: "500", fontFamily: "inherit" }}>
            {props.label} {props.required && <span style={{ color: "red" }}>*</span>}
          </label>
        )}
        <textarea
          id={ctx.element.id}
          data-element-id={ctx.element.id}
          data-element-type="Textarea"
          name={props.name}
          placeholder={props.placeholder}
          rows={props.rows}
          required={props.required}
          className={ctx.className}
          style={{ fontFamily: "inherit", ...ctx.style }}
        />
      </div>
    );
  },
  aiHint: "Multi-line form text area for messages or feedback.",
};

// 16. Submit
export const submitPropsSchema = z.object({
  text: z.string().default("Submit"),
});
export type SubmitProps = z.infer<typeof submitPropsSchema>;

export const submitDefinition: ElementDefinition<SubmitProps> = {
  type: "Submit",
  label: "Submit Button",
  icon: "send",
  category: "form",
  propsSchema: submitPropsSchema,
  defaultProps: { text: "Submit" },
  defaultStyle: {
    display: { keyword: "inline-flex" },
    alignItems: { keyword: "center" },
    justifyContent: { keyword: "center" },
    padding: { unit: "px", value: 12 },
    borderRadius: { token: "radius.md" },
    fontWeight: { keyword: "600" },
    cursor: { keyword: "pointer" },
    background: { token: "color.primary" },
    color: { token: "color.primaryForeground" },
    border: { keyword: "none" },
  },
  canHaveChildren: false,
  allowedParents: ["Form", "Box", "Container", "Section"],
  controls: [{ id: "text", label: "Button Label", type: "text", defaultValue: "Submit" }],
  render: (props, ctx) => {
    return (
      <button
        id={ctx.element.id}
        data-element-id={ctx.element.id}
        data-element-type="Submit"
        type="submit"
        className={ctx.className}
        style={ctx.style}
      >
        {props.text}
      </button>
    );
  },
  aiHint: "Form submission trigger button.",
};
