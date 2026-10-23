import { getClientConfig } from "@builder/config/client";

export default function HomePage() {
  const clientConfig = getClientConfig();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-neutral-50 text-neutral-900">
      <div className="w-full max-w-2xl bg-white border border-neutral-200 rounded-xl shadow-sm p-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="h-4 w-4 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-2xl font-bold tracking-tight">Builder — Prototype Platform</h1>
        </div>

        <p className="text-neutral-600 mb-6 leading-relaxed">
          Production-grade AI visual website builder prototype. Both Web and Worker services share PostgreSQL,
          Redis, and S3-compatible storage with zero hardcoded vendors.
        </p>

        <div className="rounded-lg bg-neutral-100 p-4 font-mono text-sm border border-neutral-200">
          <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">Client Config</div>
          <div>App URL: <span className="text-blue-600">{clientConfig.appUrl}</span></div>
          <div>Public API URL: <span className="text-blue-600">{clientConfig.apiPublicUrl}</span></div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/dashboard"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Go to Dashboard →
          </a>
          <a
            href="/login"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Create account
          </a>
        </div>

        <div className="mt-8 flex gap-4 text-xs text-neutral-500 border-t pt-4">
          <span>Phase 1 Prototype</span>
          <span>•</span>
          <span>PostgreSQL + Better Auth</span>
          <span>•</span>
          <span>tRPC Guards Active</span>
        </div>
      </div>
    </main>
  );
}
