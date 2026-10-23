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

### 4. Run Development Servers
Start both the web app (Next.js) and background worker (BullMQ) in parallel:

```bash
pnpm dev
```
*(Alternatively, use `pnpm dev:local` for direct parallel Node execution).*

- **Web application**: [http://localhost:3000](http://localhost:3000)
- **Worker process**: Running and listening for background jobs
