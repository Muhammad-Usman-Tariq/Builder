import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "./client.js";
import { usageCounters } from "./schema/usage.js";

export interface UsageParams {
  workspaceId: string;
  metric: "ai_units" | "storage_bytes" | "sites";
  period?: string;
}

export interface ReserveUsageParams extends UsageParams {
  units: number;
}

export interface ReleaseUsageParams extends UsageParams {
  units: number;
}

export interface CommitUsageParams extends UsageParams {
  reservedUnits: number;
  usedUnits: number;
}

export function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Reserves usage units in the workspace's quota.
 * Increments `reserved` counter for the current period.
 */
export async function reserveUsage(
  db: DbClient,
  params: ReserveUsageParams
): Promise<void> {
  const period = params.period ?? getCurrentPeriod();
  const [existing] = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.workspaceId, params.workspaceId),
        eq(usageCounters.metric, params.metric),
        eq(usageCounters.period, period)
      )
    );

  if (existing) {
    await db
      .update(usageCounters)
      .set({
        reserved: sql`${usageCounters.reserved} + ${params.units}`,
        updatedAt: new Date(),
      })
      .where(eq(usageCounters.id, existing.id));
  } else {
    await db.insert(usageCounters).values({
      id: `cnt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      workspaceId: params.workspaceId,
      metric: params.metric,
      period,
      used: 0,
      reserved: params.units,
    });
  }
}

/**
 * Releases previously reserved usage units on failure or cancellation.
 * Decrements `reserved` counter (cannot drop below 0).
 */
export async function releaseUsage(
  db: DbClient,
  params: ReleaseUsageParams
): Promise<void> {
  const period = params.period ?? getCurrentPeriod();
  const [existing] = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.workspaceId, params.workspaceId),
        eq(usageCounters.metric, params.metric),
        eq(usageCounters.period, period)
      )
    );

  if (existing) {
    const newReserved = Math.max(0, existing.reserved - params.units);
    await db
      .update(usageCounters)
      .set({
        reserved: newReserved,
        updatedAt: new Date(),
      })
      .where(eq(usageCounters.id, existing.id));
  }
}

/**
 * Commits usage on successful job completion:
 * Decrements `reserved` by reservedUnits and increments `used` by usedUnits.
 */
export async function commitUsage(
  db: DbClient,
  params: CommitUsageParams
): Promise<void> {
  const period = params.period ?? getCurrentPeriod();
  const [existing] = await db
    .select()
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.workspaceId, params.workspaceId),
        eq(usageCounters.metric, params.metric),
        eq(usageCounters.period, period)
      )
    );

  if (existing) {
    const newReserved = Math.max(0, existing.reserved - params.reservedUnits);
    await db
      .update(usageCounters)
      .set({
        reserved: newReserved,
        used: sql`${usageCounters.used} + ${params.usedUnits}`,
        updatedAt: new Date(),
      })
      .where(eq(usageCounters.id, existing.id));
  } else {
    await db.insert(usageCounters).values({
      id: `cnt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      workspaceId: params.workspaceId,
      metric: params.metric,
      period,
      used: params.usedUnits,
      reserved: 0,
    });
  }
}
