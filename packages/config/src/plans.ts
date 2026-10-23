export interface PlanConfig {
  name: string;
  maxSites: number;
  softDeleteRetentionDays: number;
}

export const PLAN_CONFIG: Record<string, PlanConfig> = {
  free: {
    name: "Free",
    maxSites: 10,
    softDeleteRetentionDays: 30,
  },
  pro: {
    name: "Pro",
    maxSites: 50,
    softDeleteRetentionDays: 30,
  },
  enterprise: {
    name: "Enterprise",
    maxSites: 1000,
    softDeleteRetentionDays: 90,
  },
};

export function getPlanConfig(planName?: string | null): PlanConfig {
  const normalized = (planName || "free").toLowerCase();
  return PLAN_CONFIG[normalized] || PLAN_CONFIG.free!;
}
