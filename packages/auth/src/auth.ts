import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getEnv } from "@builder/config";
import {
  db,
  users,
  sessions,
  accounts,
  verifications,
  workspaces,
  workspaceMembers,
  type DbClient,
} from "@builder/db";

export function createAuth(options?: { db?: DbClient; secret?: string; baseURL?: string }) {
  let envSecret = "";
  let appUrl = options?.baseURL || "";
  let googleClientId: string | undefined;
  let googleClientSecret: string | undefined;

  try {
    const env = getEnv();
    envSecret = env.AUTH_SECRET;
    if (!appUrl) appUrl = env.APP_URL;
    googleClientId = env.GOOGLE_CLIENT_ID;
    googleClientSecret = env.GOOGLE_CLIENT_SECRET;
  } catch {
    envSecret = process.env["AUTH_SECRET"] || "development-fallback-auth-secret-32-chars";
    if (!appUrl) appUrl = process.env["APP_URL"] || "";
    googleClientId = process.env["GOOGLE_CLIENT_ID"];
    googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  }

  if (!appUrl) {
    throw new Error("APP_URL is required — configure APP_URL in environment");
  }

  const database = options?.db ?? db;

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    secret: options?.secret || envSecret,
    baseURL: options?.baseURL || appUrl,
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    rateLimit: {
      enabled: false,
    },
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const wsId = `ws_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
            const safeName = (user.name || "User").replace(/[^a-zA-Z0-9]/g, " ").trim();
            const slug = `${safeName.toLowerCase().replace(/\s+/g, "-") || "ws"}-${crypto.randomUUID().slice(0, 6)}`;

            await database.insert(workspaces).values({
              id: wsId,
              name: `${user.name || "Personal"}'s Workspace`,
              slug,
              ownerId: user.id,
              plan: "free",
            });

            await database.insert(workspaceMembers).values({
              id: `wsm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
              workspaceId: wsId,
              userId: user.id,
              role: "OWNER",
            });
          },
        },
      },
    },
  });
}

export const auth = createAuth();
export type Auth = ReturnType<typeof createAuth>;
