import { router } from "../trpc";
import { sitesRouter } from "./sites";
import { workspacesRouter } from "./workspaces";
import { documentsRouter } from "./documents";
import { jobsRouter } from "./jobs";
import { assetsRouter } from "./assets";
import { aiRouter } from "./ai";
import { templatesRouter } from "./templates";
import { publishRouter } from "./publish";
import { formsRouter } from "./forms";
import { mcpRouter } from "./mcp";
import { cmsRouter } from "./cms";
import { integrationsRouter } from "./integrations";
import { domainsRouter } from "./domains";

export const appRouter = router({
  sites: sitesRouter,
  workspaces: workspacesRouter,
  documents: documentsRouter,
  jobs: jobsRouter,
  assets: assetsRouter,
  ai: aiRouter,
  templates: templatesRouter,
  publish: publishRouter,
  forms: formsRouter,
  mcp: mcpRouter,
  cms: cmsRouter,
  integrations: integrationsRouter,
  domains: domainsRouter,
});

export type AppRouter = typeof appRouter;
