# Builder — System Architecture v1

Oct 7, 2026 · @usman

## 1. Purpose and guiding principles

The prototype is built on the final architecture, so after approval we extend it instead of rewriting it. Fewer features, but every feature is real: real database, real login, real AI, real publish to Vercel. No mock values.

**Principles every part must follow:**

1. **One data tree for everything.** Every website is stored as a data tree (JSON), never as code. Templates, AI, Figma, URL clone and screenshot import all produce the same tree. The editor only edits the tree.
2. **Code is generated only at publish time.** One converter turns the tree into HTML, CSS and small JavaScript files.
3. **One renderer, two uses.** The same element code draws the canvas in the editor and produces the published HTML. What you see is what you publish.
4. **The server decides.** All permission checks run on the server. Hiding a button is never security.
5. **Every change is an operation.** Edits are small recorded changes. This gives undo, autosave, history, collaboration and offline sync from one mechanism.
6. **Heavy work runs in the background.** AI generation, imports and publishing run as jobs in a worker, with live progress, retry and cancel.
7. **Design for later, build for now.** Collaboration and offline desktop sync are not in the prototype (MCP and the desktop app ship as small real slices), but the data model and APIs are shaped so the full versions plug in without changes.
8. **One language: TypeScript** across frontend, backend, worker and desktop, with shared types.

## 2. Technology stack

Everything is TypeScript, so types are shared from the database to the editor to the AI output. Each choice below is mature, widely used and has good documentation.

| Area | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | One language everywhere; shared types catch bugs early |
| Repo | pnpm workspaces + Turborepo | One repo for web, worker, desktop and shared packages |
| Web app + API | Next.js (App Router) + React | Dashboard, editor and API in one app; deploys easily |
| Internal API | tRPC | Type-safe calls between frontend and backend |
| Public API | REST (Next.js route handlers) | Forms, API tokens, webhooks, MCP need standard HTTP |
| Validation | Zod | One schema validates user input, the data tree and AI output |
| Database | PostgreSQL + Drizzle ORM | Reliable, relational, JSONB for documents; any Postgres works through DATABASE\_URL (local, Supabase, Railway, VPS) |
| Auth | Better Auth | Email/password, magic link, Google/GitHub, TOTP 2FA, session list built in. Prototype: email/password only; Google turns on when its env keys are set |
| Document model | Yjs (CRDT) | Undo, autosave, real-time collaboration and offline sync from one model |
| Editor UI state | Zustand | Simple store for selection, panels, zoom (not saved data) |
| UI | Tailwind CSS + Radix UI | Accessible primitives (menus, dialogs) with our own design tokens |
| File storage | Cloudflare R2 (S3 API) | Decided. Free tier covers the prototype (10 GB, no download fees); any S3-compatible service works through S3\_\* env |
| Image processing | sharp | Resize, convert to WebP/AVIF, read dimensions |
| Background jobs | BullMQ + Redis | Queues with retry, progress events, cron; any Redis works through REDIS\_URL (Upstash, Memurai, local, VPS) |
| Worker service | Node.js on Railway or Fly.io | Long jobs (AI, imports, publish) that serverless cannot run |
| Headless browser | Playwright (in worker) | URL clone, screenshots, visual tests |
| Live updates | Server-Sent Events | Job progress, publish logs, notifications |
| Collaboration server | Hocuspocus (Yjs) | Added in Phase 3; same document model |
| AI | Vercel AI SDK, provider adapters | No model names in code: provider and model come from env, with a fallback chain (section 10.5) |
| Publishing | Vercel REST API | Deploy with the access token each customer pastes into Builder (stored encrypted); OAuth later |
| Billing | Stripe | Checkout, customer portal, webhooks |
| Email | Resend (or any SMTP) | Chosen by EMAIL\_PROVIDER: none (printed to the log), resend or smtp |
| Monitoring | Sentry | Errors from web, worker and desktop |
| Testing | Vitest + Playwright | Unit tests and end-to-end tests |
| Desktop (Phase 4) | Electron | Reuses the web editor; mature auto-update and signing |

**Where it runs:** prototype testing on a laptop; after approval, web app on Vercel, database on Supabase, Redis on Upstash (or Railway), worker on Railway, files on Cloudflare R2; in production the worker and Redis can move to the client's VPS. Every move is an env change only (section 9.5).

## 3. System overview

The platform has two services: the **web app** answers users quickly, and the **worker** does slow jobs. Both share PostgreSQL, Redis and R2. Published sites live on the customer's Vercel account and only call us to submit forms.

&#91;embedded content: system overview · 2 services, 3 data stores\]

The web app hands slow work to the worker through Redis queues; the worker reads and writes the same database and storage, calls AI and other external APIs, and uploads finished sites to Vercel.

## 4. Monorepo structure

One repository with three apps and shared packages. The most important package is `document`: it defines the data tree, and every other part depends on it.

```
builder/
├─ apps/
│  ├─ web/          Next.js: dashboard, editor, tRPC API, REST API
│  ├─ worker/       Node: AI, imports, publish, image jobs, cron
│  └─ desktop/      Electron shell around the editor (Phase 4)
├─ packages/
│  ├─ document/     Data tree types, Zod schemas, operations, migrations
│  ├─ elements/     Primitive registry: props, defaults, controls, renderer
│  ├─ renderer/     Tree -> React (canvas) and tree -> HTML/CSS (publish)
│  ├─ editor-core/  Selection, drag, resize, snap, history, commands
│  ├─ db/           Drizzle schema, migrations, queries
│  ├─ auth/         Better Auth config, roles, permission guards
│  ├─ ai/           Provider adapters, prompts, generation pipeline
│  ├─ publish/      Site builder, Vercel adapter, headers, sitemap
│  ├─ importers/    Figma, URL, screenshot adapters -> data tree
│  ├─ jobs/         Queue names, job payload types, progress events
│  ├─ storage/      Storage adapter interface + R2 implementation
│  ├─ mcp/          MCP server tools and MCP client manager
│  ├─ ui/           Product design system (tokens + components)
│  └─ config/       env.ts (Zod-validated env), TypeScript, lint, Tailwind
└─ templates/       Template trees (JSON) + registry, checked into git
```

**Dependency rule:** packages never import from apps. `document` imports nothing from other packages. This keeps the core clean and testable.

## 5. The data tree (site document)

Each site is one **site document**: a JSON object holding pages, elements, styles, tokens, components and asset references. Elements are stored in a **flat map by ID**, and each element lists its children in order. The tree shape comes from those links, not from nesting.

**Why flat, not nested:** finding any element by ID is instant; an edit touches one small record; collaboration merges cleanly; undo stores tiny changes instead of copies of the whole site.

### 5.1 Core types

```typescript
type ID = string; // short unique id (nanoid)

interface SiteDocument {
  schemaVersion: number;              // for safe migrations
  site: { name: string; defaultLocale: string; locales: string[] };
  breakpoints: Breakpoint[];          // desktop (base), tablet, mobile
  tokens: DesignTokens;               // colors, fonts, spacing, radius, shadows
  pages: Record<ID, Page>;
  elements: Record<ID, Element>;      // flat map of every element
  styles: Record<ID, StyleRule>;      // flat map of every style rule
  components: Record<ID, ComponentDef>;
  assets: Record<ID, AssetRef>;       // metadata only; files live in R2
}

interface Page {
  id: ID; name: string; slug: string; folderId?: ID;
  rootId: ID;                         // the page's top element
  seo: { title?: string; description?: string; ogImageAssetId?: ID };
  status: 'draft' | 'published';
  cmsTemplate?: { collectionId: ID }; // dynamic page per CMS entry
}

interface Element {
  id: ID;
  type: string;                       // 'Box', 'Heading', 'Button'... from the registry
  name?: string;                      // layer name
  parentId: ID | null;
  children: ID[];                     // order = visual order
  props: Record<string, PropValue>;   // text, href, src, alt, html tag...
  styleIds: ID[];                     // its local style + shared classes
  hidden?: boolean; locked?: boolean;
  instanceOf?: { componentId: ID; overrides: Record<ID, Partial<Element>> };
  origin?: 'user' | 'template' | 'ai' | 'figma' | 'url' | 'image';
  aiLocked?: boolean;                 // AI regeneration must not change it
}

type PropValue =
  | string | number | boolean
  | { asset: ID }                     // image or video from the library
  | { token: string }                 // e.g. a brand color
  | { bind: { collection: ID; field: string } }; // CMS value

interface StyleRule {
  id: ID;
  kind: 'local' | 'class';            // local = one element; class = reusable
  name?: string;
  // breakpoint -> state -> CSS declarations
  values: Record<ID, Partial<Record<StyleState, CSSDeclarations>>>;
}
type StyleState = 'default' | 'hover' | 'focus' | 'active';
type CSSDeclarations = Record<string, StyleValue>; // any CSS property
type StyleValue =
  | { unit: 'px' | '%' | 'rem' | 'em' | 'vw' | 'vh' | 'fr'; value: number }
  | { keyword: string }               // 'flex', 'center', 'auto'
  | { token: string }                 // 'color.primary', 'space.4'
  | { raw: string };                  // gradients, shadows, transforms
```

### 5.2 Responsive rules

- **Desktop is the base.** Tablet stores only what is different from desktop. Mobile stores only what is different from tablet.
- Reading a value walks down: mobile → tablet → desktop. The first value found wins.
- This is deterministic, which the spec requires (ED-010), and it keeps documents small.

### 5.3 A tiny example

```json
{
  "pages":    { "p1": { "name": "Home", "slug": "/", "rootId": "e1", "status": "draft", "seo": {} } },
  "elements": {
    "e1": { "type": "Body",    "parentId": null, "children": ["e2"], "props": {}, "styleIds": [] },
    "e2": { "type": "Section", "parentId": "e1", "children": ["e3", "e4"], "props": {}, "styleIds": ["s2"] },
    "e3": { "type": "Heading", "parentId": "e2", "children": [], "props": { "text": "Fresh Coffee", "level": 1 }, "styleIds": ["s3"] },
    "e4": { "type": "Button",  "parentId": "e2", "children": [], "props": { "text": "Order Now", "href": "/menu" }, "styleIds": ["s4"] }
  },
  "styles": {
    "s4": { "kind": "local", "values": {
      "desktop": { "default": { "background": { "token": "color.primary" } },
                   "hover":   { "opacity": { "unit": "%", "value": 90 } } },
      "mobile":  { "default": { "width": { "unit": "%", "value": 100 } } } } }
  }
}
```

### 5.4 Rules that protect the data

- Every document is validated by its Zod schema before saving: no unknown types, no broken parent/child links, no duplicate IDs.
- `schemaVersion` + migration functions upgrade old documents automatically when the format changes.
- Assets are referenced by ID. Replacing a file updates every place it is used (spec: asset replacement).

## 6. Element registry (the building blocks)

About 20 primitives are coded once. Everything else (sections, templates, AI output) is a combination of them. Adding a primitive later means adding one registry entry; nothing else changes.

### 6.1 What each primitive defines

```typescript
interface ElementDefinition<P> {
  type: string;                         // 'Button'
  label: string; icon: string; category: 'layout' | 'content' | 'form' | 'interactive' | 'special';
  propsSchema: z.ZodType<P>;            // allowed props + validation
  defaultProps: P;
  defaultStyle: CSSDeclarations;
  canHaveChildren: boolean;
  allowedChildren?: string[];           // e.g. Form accepts inputs
  allowedParents?: string[];            // e.g. Input only inside Form
  controls: ControlSpec[];              // which inspector fields appear
  render: (props: P, ctx: RenderContext) => ReactNode; // ONE renderer
  clientScript?: string;                // tiny JS for sliders, tabs, menus
  aiHint: string;                       // short description for the AI
}
```

### 6.2 Primitive list

| Group | Primitives | Prototype? |
| --- | --- | --- |
| Layout | Body, Section, Box, Container | Yes |
| Content | Heading, Text, RichText, Image, Link, Button, Icon | Yes |
| Media | Video, Embed (YouTube/Vimeo) | Phase 2 |
| Forms | Form, Input, Textarea, Select, Checkbox, SubmitButton | Form, Input, Textarea, Submit |
| Navigation | Navbar (with mobile menu), Dropdown | Navbar |
| Interactive | Slider, Tabs, Accordion, Lightbox | Phase 2 |
| Data | CMS List, CMS Field | Phase 2 |
| Special | Map, Custom Code Embed | Phase 2 |

### 6.3 One renderer, two uses

Each `render` function is a plain React component.

- **In the editor:** React renders it inside the canvas iframe, with editor helpers (selection outlines) added around it.
- **At publish:** the same component runs through `renderToStaticMarkup` on the server and becomes pure HTML. Styles are compiled to one CSS file.
- Result: the canvas and the live site cannot drift apart (spec ED-QA-020).

### 6.4 How styles become CSS

- Each style rule becomes a class, e.g. `.s4 { … }`.
- Tablet and mobile values become `@media (max-width: …)` blocks.
- States become `:hover`, `:focus`, `:active`.
- Tokens become CSS variables on `:root` (`--color-primary`), so changing a brand color updates the whole site.

## 7. Editor engine

The site document lives in a **Yjs document** from day one. Every edit goes through a **command**, which changes the Yjs document. Undo, autosave, collaboration and offline sync all read those same changes, so none of them needs a rewrite later.

### 7.1 How one edit flows

1. User picks red in the color panel.
2. The inspector calls a command: `setStyle(elementId, 'background', red, { breakpoint, state })`.
3. The command validates the value, then changes the Yjs document in one transaction.
4. The canvas re-renders only the changed element.
5. Yjs records the change for **undo** (Y.UndoManager).
6. The change is queued for **autosave** and sent to the server within about 1 second.
7. Later, the same change also goes to **collaborators** and syncs to the **desktop app**.

### 7.2 Commands (the only way to change a site)

`insertElement`, `moveElement`, `deleteElement`, `duplicateElement`, `setProp`, `setStyle`, `resetStyle`, `groupElements`, `ungroupElements`, `wrapInBox`, `createComponent`, `detachInstance`, `addPage`, `updatePage`, `setToken`, `applyAiPatch`.

Each command checks the registry rules (allowed parents and children), keeps IDs unique and leaves no orphans (spec ED-QA-018). AI, imports and MCP also use these commands, so they follow the same rules.

### 7.3 Editor managers

| Manager | Job |
| --- | --- |
| Selection | Selected and hovered elements; keeps canvas and layers in sync |
| Drag | Insert from panel, move on canvas, valid drop target detection |
| Resize | Handles, min/max limits, no auto-size jumps |
| Snap | Grid, element edges, alignment guides |
| History | Undo/redo stack with readable labels ("Changed button color") |
| Clipboard | Copy, cut, paste across pages with fresh IDs |
| Viewport | Zoom, pan, fit, breakpoint switch |
| Persistence | Autosave queue, retry, status: saving / saved / offline / error |

### 7.4 Canvas

- The site renders inside an **iframe**, so site CSS never mixes with editor CSS.
- Selection boxes, handles and guides are drawn in an **overlay** on top of the iframe, in the editor window.
- Breakpoint preview = the iframe width changes (1440 / 768 / 375 px by default); CSS media rules do the rest.
- Preview mode hides the overlay and shows the site exactly as published.

### 7.5 Saving and versions

- The server keeps the Yjs state plus a plain JSON snapshot of the latest document.
- The JSON snapshot is validated on the server; an invalid change is rejected and the editor shows an error.
- A **version** snapshot is stored on every publish, before AI regeneration and on manual "Save version".

## 8. Database schema (core tables)

PostgreSQL holds accounts, workspaces, sites and documents. The site document is stored as JSONB plus its Yjs state; everything else is normal relational tables. Every row that belongs to a customer carries a `workspace_id`, which permission checks use.

| Table | Key columns | Purpose | Prototype? |
| --- | --- | --- | --- |
| users | id, email, name, avatar | People (Better Auth also adds sessions, accounts, 2FA tables) | Yes |
| workspaces | id, name, slug, owner\_id, plan | A team or agency account | Yes |
| workspace\_members | workspace\_id, user\_id, role | OWNER, ADMIN, MEMBER, VIEWER (agency/client roles later) | Yes |
| invites | workspace\_id, email, role, token, expires\_at | Team invitations | Phase 2 |
| sites | id, workspace\_id, name, thumbnail, deleted\_at | One website project; soft delete with grace period | Yes |
| site\_documents | site\_id, yjs\_state (bytea), snapshot (jsonb), schema\_version, updated\_at | The current data tree | Yes |
| site\_versions | id, site\_id, snapshot (jsonb), reason, created\_by, created\_at | Saved versions for restore and publish | Yes |
| assets | id, workspace\_id, site\_id, key, type, size, width, height, blurhash | Media files in R2 | Yes |
| templates | id, slug, name, category, tags, preview, document (jsonb), version | Template catalog | Yes |
| jobs | id, workspace\_id, type, status, progress, input, output, error | AI, import and publish job records | Yes |
| deployments | id, site\_id, version\_id, provider, status, url, logs, created\_at | Publish history and rollback | Yes |
| integrations | id, workspace\_id, provider, encrypted\_tokens, scopes, status | Vercel, Figma, GitHub and others | Vercel only |
| domains | id, site\_id, hostname, verified, ssl\_status | Custom domains | Phase 2 |
| form\_submissions | id, site\_id, form\_id, data (jsonb), spam\_score, created\_at | Contact form entries | Yes |
| cms\_collections / cms\_entries | schema (jsonb) / data (jsonb), slug, status | CMS | Phase 2 |
| comments | id, site\_id, page\_id, element\_id, x, y, body, resolved | Review comments | Phase 3 |
| subscriptions | workspace\_id, stripe\_ids, status, plan, period\_end | Billing | Phase 2 |
| usage\_counters | workspace\_id, metric, period, used, reserved | AI units, storage, sites | Yes (AI units) |
| audit\_log | id, workspace\_id, actor, action, target, data, created\_at | Security and MCP audit trail | Yes |
| api\_tokens / webhooks / mcp\_connections | hashed secrets, scopes | External automation | Phase 3 |

**Rules:** secrets are encrypted at rest (AES-256-GCM, key outside the database). Tokens are stored hashed. Soft-deleted rows are purged by a cron job.

## 9. Backend API, permissions and jobs

The web app answers fast requests. Anything slow (over about 10 seconds, or needing a browser) becomes a job for the worker. Every request passes one permission layer on the server.

### 9.1 API surfaces

| Surface | Used by | Examples |
| --- | --- | --- |
| tRPC | Our dashboard and editor | `sites.create`, `document.save`, `assets.presign`, `ai.generateSite`, `publish.start` |
| REST `/api/public/*` | Published websites | Form submission endpoint |
| REST `/api/v1/*` | API tokens, Zapier, Make | Sites, pages, CMS entries (Phase 3) |
| Webhooks in | Stripe, Vercel, Figma | Payment events, deployment status |
| SSE `/api/events` | Editor and dashboard | Job progress, publish logs, notifications |
| MCP server `/mcp` | External AI agents | Read project, create sections (Phase 3) |

### 9.2 Permission layer

Every tRPC procedure is built from guards:

```typescript
export const updatePage = siteProcedure          // 1. logged in, 2. member of the site's workspace
  .use(requireRole('MEMBER'))                    // 3. role is high enough
  .use(requirePlanLimit('pages'))               // 4. plan allows it
  .input(UpdatePageInput)                        // 5. Zod-validated input
  .mutation(({ ctx, input }) => pages.update(ctx, input));
```

- The site ID always resolves to its workspace on the server; a user can never reach another workspace's data by changing an ID.
- Rate limits (Redis) protect login, forms, AI and imports.
- Security-sensitive actions write to `audit_log`.

### 9.3 Worker jobs

| Queue | Job | Prototype? |
| --- | --- | --- |
| ai | generate-site, regenerate-section, rewrite-text | Yes |
| publish | build-site, deploy-vercel, poll-deployment | Yes |
| media | process-image (resize, WebP, blurhash) | Yes |
| import | figma-import, url-scan, url-import, image-import | Phase 2–3 |
| email | send-email | Yes |
| cron | soft-delete-purge, form-purge, scheduled-publish, session-cleanup, dunning | Partly |

**Job lifecycle:** queued → running (progress %) → succeeded / failed / cancelled. Jobs are idempotent (safe to retry), report progress through Redis pub/sub to SSE, and store results in the `jobs` table.

### 9.4 Configuration (environment variables)

No key, URL, model name or provider is written in code. Every setting comes from environment variables, read in one place (`packages/config/env.ts`) and validated with Zod when each app starts. If a required value is missing or wrong, the app refuses to start and lists exactly which variables to fix.

| Group | Variables | Required? |
| --- | --- | --- |
| App | `APP_URL`, `API_PUBLIC_URL` (tunnel URL during laptop testing), `NODE_ENV` | Yes |
| Database | `DATABASE_URL`, optional `DATABASE_URL_DIRECT` (migrations, worker), `DATABASE_URL_TEST` | Yes |
| Redis | `REDIS_URL` (TCP `redis://` or `rediss://`, any Redis-compatible server) | Yes |
| Storage | `STORAGE_PROVIDER` (`s3` or `cloudinary`). If `s3`: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE`. If `cloudinary`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. | Optional (cleanly OFF when omitted; provider keys required if configured) |
| Auth | `AUTH_SECRET`; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Secret yes; Google optional |
| AI | `AI_MODEL_CHAIN`, `AI_MODEL_CHAIN_<TASK>`, one API key per provider used (section 10.5) | Optional (cleanly OFF when omitted; provider keys required if chain configured) |
| Email | `EMAIL_PROVIDER` (`none`, `resend`, `smtp`) + that provider's keys | Optional (default `none`) |
| Images | `UNSPLASH_ACCESS_KEY` | Optional (without it, AI leaves image slots to fill) |
| Security | `ENCRYPTION_KEY` (stored Vercel tokens), `SENTRY_DSN` | Key yes; Sentry optional |

**Swappable services:** the code talks to standard interfaces, not to vendors directly from app code. Any PostgreSQL, any Redis-compatible server, and either S3-compatible storage (R2, AWS, MinIO) or Cloudinary work by changing env only. Optional features switch off cleanly when their variables are empty, and at startup each app prints a short summary of what is active (never secrets) and checks that the database, Redis, and configured storage provider are reachable.

A committed `.env.example` lists every variable with a comment; real `.env` files are never committed.

### 9.5 Where it runs (prototype and production)

| Part | Prototype testing (laptop) | After approval | Production |
| --- | --- | --- | --- |
| Web app | `pnpm dev` on laptop | Vercel | Vercel |
| Worker | `pnpm dev` on laptop | Railway | Client's VPS |
| PostgreSQL | Existing local Postgres, dedicated database and user configured via DATABASE_URL | Supabase | Supabase or client's VPS |
| Redis | Upstash free (or Memurai / local Redis) | Upstash or Railway | Client's VPS |
| Storage | Cloudflare R2 | Cloudflare R2 | R2 with a custom domain |
| Public URL for forms and MCP | Cloudflare Tunnel to the laptop | Vercel URL | Own domain |
| Code | Client's GitHub organization | Same | Same |

The worker always needs a process that stays alive (jobs run for minutes), so it never runs on serverless functions. Moving the public URL means republishing customer sites, because their forms post to it.

The web app never runs long jobs itself: it adds a job to the queue and streams progress back to the user.

## 10. AI generation pipeline

The AI never writes code. It writes a simple **AI tree** (nested JSON using our primitives and design tokens), and our compiler turns that into the real site document with IDs and style rules. Big jobs are split into small steps, so each AI call is short, checkable and retryable.

### 10.1 Why an AI tree in between

AI models make fewer mistakes with a short, nested format than with our full flat format. The compiler then adds IDs, creates style rules, links parents and children, and validates everything. If the AI format improves later, only the compiler changes.

```json
{ "type": "Section", "style": { "padding": "space.16", "background": "color.surface" },
  "children": [
    { "type": "Heading", "text": "Lahore's warmest coffee", "level": 1 },
    { "type": "Button", "text": "See the menu", "href": "/menu", "variant": "primary" },
    { "type": "Image", "imageQuery": "latte art wooden table", "alt": "Latte with heart art" } ] }
```

### 10.2 Steps for "create a site from a prompt"

1. **Reserve AI units** from the workspace quota. Stop early if the plan has none left.
2. **Brief:** turn the prompt into business type, audience, tone, goals and style. Ask the user 1–3 questions only if key facts are missing.
3. **Plan:** sitemap (pages + sections per page) and theme tokens (palette, font pairing, spacing, radius). The user sees the plan and can edit it.
4. **Sections:** generate each page's sections in parallel. Each call gets the brief, the theme, two or three example sections from our library and the primitive list.
5. **Validate and repair:** check every AI tree against Zod. Fix small problems automatically; re-ask the AI once for bigger ones.
6. **Images:** each `imageQuery` is filled from Unsplash/Pexels, or left as a placeholder slot the user can replace.
7. **Compile and save:** build the site document, save a version, release unused AI units, open the editor.

Progress for each step streams to the user ("Planning pages…", "Building Home: 3 of 6 sections").

### 10.3 Editing with AI

| Action | What is sent to the AI | What comes back |
| --- | --- | --- |
| Regenerate site | Brief + theme + list of `aiLocked` elements | New site; locked elements are kept |
| Regenerate page or section | That part as an AI tree + instruction | Replacement AI tree |
| "Make it more premium" | Selected part + instruction | Patch: changed styles and text |
| Rewrite text | Text + tone | New text |

Every AI change is applied through `applyAiPatch`, so it is one undo step, it is recorded in history, and the changed elements are marked `origin: 'ai'` (spec AIC-018, AIC-021).

### 10.4 Safety and cost controls

- Provider adapters for every supported provider; which providers and models are used is decided only by env (section 10.5).
- Timeouts, cancel button and retry on every job; units are released on cancel or failure.
- AI output is data, never HTML: text is escaped, links are checked for safe schemes (`https`, `mailto`, `tel`).

### 10.5 Model selection from env, with fallback (Universal AI Providers)

No model name appears in code. Any model or provider works by editing `.env` only, with zero code changes.

#### 10.5.1 Provider definitions in env
Each provider has a short name used in `AI_MODEL_CHAIN`:
- `AI_PROVIDER_<NAME>_TYPE` = `openai | anthropic | google | xai | groq | mistral | deepseek | openrouter | openai-compatible`
- `AI_PROVIDER_<NAME>_API_KEY` = key (optional for local servers like Ollama/LM Studio)
- `AI_PROVIDER_<NAME>_BASE_URL` = required for `openai-compatible`; optional override for others
- `AI_PROVIDER_<NAME>_HEADERS` = optional JSON string of extra headers
- `AI_PROVIDER_<NAME>_STRUCTURED` = `json_schema | json_mode | prompt` (default `json_schema`)
- `AI_PROVIDER_<NAME>_VISION` = `true | false` (default `false`)
- `AI_PROVIDER_<NAME>_TIMEOUT_MS` = optional timeout in ms

```bash
# Example chain referencing universal providers:
AI_MODEL_CHAIN="grok:grok-beta,local:llama3,nvidia:meta/llama-3.1-70b-instruct"

# Provider definitions:
AI_PROVIDER_GROK_TYPE="xai"
AI_PROVIDER_GROK_API_KEY="xai-..."
AI_PROVIDER_GROK_VISION="true"

AI_PROVIDER_LOCAL_TYPE="openai-compatible"
AI_PROVIDER_LOCAL_BASE_URL="http://localhost:11434/v1"
AI_PROVIDER_LOCAL_STRUCTURED="json_mode"

AI_PROVIDER_NVIDIA_TYPE="openai-compatible"
AI_PROVIDER_NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
AI_PROVIDER_NVIDIA_API_KEY="nvapi-..."
AI_PROVIDER_NVIDIA_STRUCTURED="json_schema"

# Optional per-task chains; if not set, AI_MODEL_CHAIN is used:
AI_MODEL_CHAIN_PLAN="..."       # brief, sitemap, theme
AI_MODEL_CHAIN_SECTIONS="..."   # section generation
AI_MODEL_CHAIN_TEXT="..."       # rewrite text
AI_MODEL_CHAIN_VISION="..."     # screenshot import (providers MUST have VISION=true)
```

The `openai-compatible` type works out of the box with Ollama, LM Studio, vLLM, llama.cpp server, NVIDIA NIM, Together, Fireworks, Meta Llama API, and any other OpenAI-compatible endpoint.

**Backward compatibility:** Legacy short forms (e.g. `google:<model-id>` with `GOOGLE_API_KEY`, `openai:<model-id>` with `OPENAI_API_KEY`, `anthropic:<model-id>` with `ANTHROPIC_API_KEY`) continue working if no explicit `AI_PROVIDER_<NAME>_*` is defined.

#### 10.5.2 Structured output modes and repair loop
Three structured modes are supported per provider:
1. `json_schema`: native structured output (`generateObject` with schema)
2. `json_mode`: requests JSON mode (`generateObject` with `output: "no-schema"`), validated with Zod
3. `prompt`: embeds the JSON schema in the system prompt, parses response JSON/codeblock, validated with Zod

All modes validate against Zod schemas. On validation failure, the engine performs exactly **1 repair attempt** with the message:
`"The previous output was invalid JSON / did not match schema: <err>. Fix and return only valid JSON"`
before failing over to the next model in the chain.

#### 10.5.3 Startup validation & connectivity
- **Startup validation:** At system start, Zod validates every provider in any chain: type is supported, base URL is present for `openai-compatible`, API keys are present (unless connecting to local loopback URL like `http://localhost:...`). Empty strings count as missing. If `AI_MODEL_CHAIN_VISION` contains a provider without `VISION=true`, startup fails immediately with a descriptive error.
- **Startup summary:** Prints provider name, type, base URL host (if custom), and model. NEVER prints keys.
- **Connectivity check:** At startup, `verifyConnectivity` pings each configured provider (`GET <base_url>/models`) and reports reachable/unreachable with response time.

**Changing models** = edit `.env` and restart. Zero code changes required.


## 11. Publishing pipeline

Publishing turns one saved version of the data tree into static files and uploads them to the customer's own Vercel account. After that, Vercel serves visitors directly; our servers are only called for form submissions.

### 11.1 Steps

1. **Pre-flight checks:** Vercel connected, every page has a slug, no broken links, images present, form endpoints valid. Blocking problems stop here with clear messages (PUB-001).
2. **Freeze a version:** copy the current document into `site_versions`. The build always uses this frozen copy.
3. **Build** (worker, package `publish`):
   - render each page to HTML with the shared renderer;
   - compile all style rules into one minified CSS file;
   - add tiny scripts only for interactive elements used on the site;
   - copy referenced images (already optimized) into the build;
   - write `sitemap.xml`, `robots.txt`, favicon and social images, SEO meta tags;
   - write `vercel.json` with security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) and redirects.
4. **Deploy:** upload files to the Vercel API using the access token the customer saved in Builder, create a deployment, then poll its status.
5. **Stream logs** to the editor over SSE until Vercel reports ready or failed.
6. **Record** the deployment (URL, version, status) for history and rollback.

### 11.2 Output

```
index.html        about/index.html     menu/index.html
assets/site.css   assets/site.js       assets/img/*.webp
sitemap.xml       robots.txt           vercel.json
```

The same output can later go to Netlify, Cloudflare Pages or a ZIP download by adding a new deploy adapter.

### 11.3 Dynamic parts on a static site

| Feature | How |
| --- | --- |
| Forms | The form posts to `https://api.<our-domain>/public/forms/<siteId>/<formId>`; we store it, filter spam, send email/webhook |
| CMS pages | One HTML page per entry is built at publish; changing content triggers a republish |
| Analytics, Meta Pixel, Clarity | Script tags added during build from integration settings |
| Scheduled publish | A cron job starts the same pipeline at the chosen time |

### 11.4 Rollback and domains

- **Rollback** = redeploy the files of an earlier deployment (or promote it through the Vercel API). No rebuild needed.
- **Domains:** the default `*.vercel.app` URL works at once. Custom domains are added to the Vercel project through the API; we show the DNS records and poll until verified and SSL is ready.
- Customers need their own Vercel plan; commercial sites require Vercel Pro. The publish setup screen says this clearly.

## 12. Imports and templates

Every way of starting a site ends in the same place: an AI tree or site document that passes the same validator. Each importer is an **adapter** with one job: read its source and output our format. They all run as worker jobs with progress and an import report.

### 12.1 Adapters

| Source | How it reads | How it converts | Phase |
| --- | --- | --- | --- |
| Template | Template JSON from the catalog | Copy, new IDs, apply workspace brand tokens, optional AI text fill | 1 |
| AI prompt | User prompt | Pipeline in section 10 | 1 |
| Figma | Figma REST API with the user's OAuth token | Frames → Box, Auto Layout → flex, text styles and variables → tokens, components → our components | 3 |
| URL | Playwright loads the public page at 3 widths, reads the DOM and computed styles | DOM → elements, computed CSS → style rules, repeated blocks → components, AI cleanup of noisy markup | 3 |
| Screenshot | Vision AI model | Detects regions (nav, hero, cards) → AI tree → compile | 3 |

**Figma limits:** the Figma API is free to use with a personal token or OAuth, but its rate limits depend on the plan the *file* belongs to. Files in a free Starter plan allow only about 6 file reads per month ([Figma rate limits](https://developers.figma.com/docs/rest-api/rate-limits)). So each customer connects their own Figma account (limits count per user, not for all of Builder), and Phase 3 also adds a **Builder Figma plugin** that exports the selected frames directly, which avoids REST API limits for free-plan users.

### 12.2 Shared import steps

1. **Scan:** list what was found (pages, frames, assets) and estimate coverage.
2. **Convert:** adapter output → normalizer (merge useless wrapper boxes, map colors and fonts to tokens).
3. **Validate:** same Zod checks as every other change.
4. **Report:** imported, approximated, skipped, unsupported.
5. **Apply:** into a new site or a new page; never overwrite existing work without confirmation.

### 12.3 URL clone rules (legal and safety)

- Public pages only. No logins, paywalls or CAPTCHA bypass. Respect `robots.txt`.
- The user must tick a rights confirmation before the import starts; it is stored in `audit_log`.
- Page and asset caps per job, crawl rate limits, scripts from the source site are removed.
- Outbound requests go through an SSRF guard (no private IPs or internal hosts).

### 12.4 Templates

- Each template is a site document saved as JSON in the `templates/` folder in git, plus a registry entry (name, category, tags, page count, style, preview images).
- A seed script loads them into the `templates` table. The catalog page reads from the table.
- A CI check certifies every template: valid schema, no broken links or missing assets, publish build succeeds, basic accessibility checks pass (spec 13.11).
- Templates are built by designers **inside our own editor**, then exported to JSON. The editor is the template tool.

## 13. Collaboration, desktop, MCP, security and monitoring

The prototype includes a small real slice of MCP and the desktop app, so the product idea is visible from day one; the full versions come in later phases. None of them needs a change to the data tree or the command layer.

### 13.1 Real-time collaboration (Phase 3)

- A **Hocuspocus** server (Yjs) joins the worker deployment. Editors connect over WebSocket after a permission check.
- Yjs merges edits from many people automatically. This replaces "last write wins", so no one silently loses work.
- Presence (avatars, cursors, selected element) uses Yjs awareness. Comments are normal database rows pinned to page + element + x/y.

### 13.2 Desktop app (thin shell in prototype, full in Phase 4)

**In the prototype:** an Electron app for macOS and Windows that signs in, lists the user's sites and opens the same editor (it loads the web editor, so every editor feature works). No offline mode yet. **Phase 4 adds** everything below.

- **Electron** wraps the same editor code. No second editor to maintain.
- The site's Yjs state is cached locally (IndexedDB), so the app opens fast and works offline.
- On reconnect, Yjs merges offline edits with cloud edits. Rare conflicts on the same value keep both in history so the user can choose.
- Login tokens go into the OS keychain. Auto-update, deep links (`builder://site/123`), native file drag-and-drop, notifications.

### 13.3 MCP (real slice in prototype, full in Phase 3)

**In the prototype (real, small):**

- **Server:** a `/mcp` endpoint with 4 tools: `get_site_structure`, `list_pages`, `update_text`, `create_section`. Auth by a per-workspace API token. `create_section` returns a confirmation request first and runs only after approval. Every call is written to `audit_log`.
- **Client:** a workspace admin adds one remote MCP server (URL + token). Builder lists its tools, and the AI copilot can call them while editing.
- Built with the official MCP TypeScript SDK. **Phase 3 adds** scopes UI, approvals, many servers, local servers from desktop, rate limits and health status.

* **Builder as MCP server:** tools such as `get_site_structure`, `list_pages`, `get_tokens`, `create_section`, `update_text`. Each tool calls the same commands as the editor, so all rules and permissions apply.
* **Builder as MCP client:** workspace admins approve external MCP servers; Builder's AI can then use their tools.
* Read-only or read-write scopes per connection; destructive and publish actions always ask for confirmation; every call is written to `audit_log`.

### 13.4 Security

- Server-side authorization on every procedure (section 9.2); tenant isolation by `workspace_id`.
- Inputs validated by Zod; rich text sanitized (DOMPurify); only safe URL schemes allowed.
- Uploads checked for type and size; SVGs sanitized; files served from a separate domain.
- OAuth tokens and secrets encrypted; webhook signatures verified with replay protection (Stripe 5-minute window).
- Security headers on our app and on published sites; CSRF protection; secret scanning in CI.

### 13.5 Monitoring

- Sentry in web, worker and desktop with release tags.
- Structured logs for jobs and deployments; alerts when cron jobs miss runs or job failure rates rise.
- Health endpoint per service; a status line in the dashboard for integration health.

## 14. Prototype scope and roadmap

The prototype (Phase 1) proves the full loop on real systems: **prompt or template → edit visually → publish to a real Vercel URL → a real visitor submits a form.** When that loop works, every later phase adds features on top of it.

### 14.1 Prototype: what is real

| Area | In the prototype |
| --- | --- |
| Accounts | Sign up, login (email + password; Google only if its env keys are set), one workspace per user, OWNER/MEMBER roles |
| Sites | Create, rename, duplicate, soft delete, list on dashboard |
| Editor | Canvas, layers, inspector (layout, spacing, size, typography, color, border, radius, shadow), drag-drop, resize, snap guides, undo/redo, 3 breakpoints, preview, autosave with status |
| Elements | Body, Section, Box, Container, Heading, Text, RichText, Image, Link, Button, Icon, Navbar, Form, Input, Textarea, Submit |
| Pages | Add, rename, reorder, slug, SEO title and description |
| Media | Upload to R2, image processing, media picker, Unsplash search |
| Templates | 5 real templates through the full certification check (catalog grows to 80+ later) |
| AI | Full prompt → multi-page site pipeline; regenerate a section; rewrite text; AI unit quota |
| Publish | Connect Vercel (customer pastes an access token, checked and stored encrypted), pre-flight, build, deploy, live logs, deployment history, rollback |
| Forms | Live form posts to our API, submissions list in dashboard, email notification when an email provider is set |
| Quality | Unit tests for document, commands and renderer; E2E tests for the main loop; Sentry |
| MCP | Real slice: /mcp server with 4 tools and confirmation; connect one external MCP server as client (section 13.3) |
| Desktop | Electron shell for macOS and Windows: sign in, list sites, open the editor (section 13.2) |
| Config | All settings from env validated at startup; AI models only from env chains (sections 9.4, 10.5) |

### 14.2 Prototype acceptance tests

- [ ] Sign up → create workspace → create blank site → edit → reload: changes are still there
- [ ] Prompt → AI builds a 4+ page site → edit a generated section → undo → publish
- [ ] Pick a template → change brand color → publish → mobile layout correct on a phone
- [ ] Visitor submits the live form → submission appears in dashboard → email received
- [ ] Rollback to the previous deployment → old version is live
- [ ] A user from another workspace cannot read or change the site (permission test)
- [ ] Claude (or another MCP client) reads a site through /mcp, then creates a section after confirmation
- [ ] Desktop app signs in, opens a site and an edit made there appears in the browser after reload
- [ ] First model in AI\_MODEL\_CHAIN is made to fail: generation still succeeds on the next model; all failing shows a clear error

### 14.3 Phases after the prototype

The roadmap below lists each phase and the gate it must pass before the next starts.

&#91;embedded content: roadmap · 4 phases, 4 gates\]

Durations are left out until team size is known; each phase starts only when the gate above it passes.

## 15. Open decisions to confirm

These choices affect the build. Each has a recommendation; confirm or change before coding starts.

| Decision | Recommendation | Why it matters |
| --- | --- | --- |
| Product name: Builder or Buildrick? | Pick one now | Used in domains, package names, UI text |
| Our domain for the API and form endpoints | Later. Until then use the Cloudflare Tunnel or Vercel URL; republish sites after switching | Published forms post to it forever |
| Yjs from day one | Yes | Avoids rewriting saving, undo and sync when collaboration and desktop arrive |
| Static output (not Next.js) for published sites | Yes for Phase 1 | Fast, cheap, works on any host; Next.js output can be added later |
| Primary AI provider | Decided: chosen in env (AI\_MODEL\_CHAIN); no model in code | Quality and cost per site; provider abstraction keeps both open |
| Electron vs Tauri for desktop | Electron | Decided: Electron. Same web code; mature auto-update and code signing; thin shell ships in the prototype |
| Hosting for our platform | Decided: laptop for prototype testing; then Vercel, Supabase, Upstash or Railway, R2; production worker on the client's VPS | Low cost at start; each can be replaced |
| Plans and prices | Define before Phase 2 billing | Plan limits are enforced in code (sites, members, storage, AI units) |
| Template design | Designer starts during Phase 1 | 80+ templates is design work that can run in parallel |
| Team size and timeline | Needed to schedule phases | Not defined yet |

- [ ] Review this document and comment on anything unclear
- [ ] Confirm the decisions above
- [ ] Set up the monorepo skeleton and start with packages `document` and `elements`
