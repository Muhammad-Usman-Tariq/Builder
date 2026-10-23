# Builder

A modern, high-performance visual website builder and CMS monorepo built with Next.js, React, TypeScript, BullMQ, and PostgreSQL.

## Architecture & Features

- **One data tree for everything**: Webpages are represented as structured JSON documents (never raw code) and edited via visual canvas.
- **Universal AI generation**: Generate entire websites or modular sections using configurable AI model fallback chains (OpenAI, Anthropic, Gemini, Groq, xAI, Ollama, etc.).
- **Zero-code static publishing**: Publishes statically optimized sites with asset pipeline, Google Fonts, and custom domain routing.
- **Background workers**: Asynchronous job queue powered by BullMQ and Redis for heavy AI tasks, image processing, and publishing.
- **MCP server & API**: Model Context Protocol endpoints for AI assistants to programmatically inspect and build sites.

For comprehensive technical specifications, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local Setup

### 1. Prerequisites
- **Node.js**: `>=22.0.0`
- **pnpm**: `v10` or newer
- **PostgreSQL**: Running locally or via managed service (e.g. Supabase, Railway)
- **Redis**: Running locally or via managed TCP provider (e.g. Upstash, Memurai)

### 2. Configure Environment
Copy the example environment template to `.env` and fill in your values:

```bash
cp .env.example .env
```

Generate secure random keys for authentication and encryption:

```bash
pnpm gen:secrets
```
Copy the generated `AUTH_SECRET` and `ENCRYPTION_KEY` into your `.env`.

### 3. Install Dependencies & Initialize Database
```bash
pnpm install
pnpm db:migrate
```

To install the Playwright Chromium browser required for webpage importing:
```bash
pnpm --filter @builder/importers exec playwright install chromium
```

### 4. Run Development Servers
Start both the web app (Next.js) and background worker (BullMQ) in parallel:

```bash
pnpm dev
```
*(Alternatively, use `pnpm dev:local` for direct parallel Node execution).*

- **Web application**: [http://localhost:3000](http://localhost:3000)
- **Worker process**: Running and listening for background jobs

## Running Tests

### 1. Test Database & Browser Setup
To run the full suite including database integration and browser import tests:
1. Ensure your `.env` has `DATABASE_URL_TEST` pointing to a dedicated test database (e.g. `postgresql://.../builder_test`) and `REDIS_URL` configured.
2. Run database migrations against the test database:
   ```bash
   DATABASE_URL=$DATABASE_URL_TEST pnpm db:migrate
   ```
   *(On Windows PowerShell: `$env:DATABASE_URL=$env:DATABASE_URL_TEST; pnpm db:migrate`)*
3. Ensure Playwright Chromium is installed:
   ```bash
   pnpm --filter @builder/importers exec playwright install chromium
   ```

### 2. Run Typecheck & Test Suite
```bash
pnpm typecheck
pnpm test
```

### 3. Database & Redis Test Skipping Behavior
If `DATABASE_URL_TEST` is missing or contains placeholder values (e.g. from an unedited `.env.example`), tests requiring a database will safely skip with a clear console message instead of crashing:
- **Skipped without configured database**:
  - `packages/db`: PostgreSQL integration tests
  - `packages/auth`: Better Auth session and user integration tests
  - `packages/jobs`: BullMQ worker jobs, URL import worker, publish worker, AI generation worker (also requires Redis)
  - `packages/mcp`: MCP server tools, audit logging, and authorization tests
  - `apps/web`: CMS router integration tests (`cms.test.ts`) and acceptance test suites (`m3`, `m5`, `m6`, `m7`, `m8`, `m9`, `m10`)
- **Always run (pure unit tests / mocked)**:
  - `packages/document`: Document schema validation, tree operations, transforms
  - `packages/renderer`: Server and client rendering
  - `packages/importers`: HTML parsing, element conversion, CSS layout extraction
  - `packages/publish`: Static site building, HTML compilation, routing
  - `packages/storage`: Upload tokens, asset metadata, S3 presigning
  - `packages/ai`: Provider fallbacks, schema synthesis, prompt parsing
  - `packages/editor-core`: State stores, undo/redo history, selection models
  - `apps/desktop`: Desktop app URL resolver, webview wrapper, error handling
