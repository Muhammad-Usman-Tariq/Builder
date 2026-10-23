import { randomUUID } from "node:crypto";
import { db, schema } from "@builder/db";

export interface AuditRecordOptions {
  workspaceId: string;
  actor: string;
  action: string;
  target: string;
  data?: Record<string, unknown> | undefined;
}

/**
 * Records an immutable entry in the audit_log table.
 * Architecture Section 13.3 & 13.4.
 */
export async function recordMcpAudit(options: AuditRecordOptions): Promise<string> {
  const auditId = randomUUID();

  try {
    await db.insert(schema.auditLog).values({
      id: auditId,
      workspaceId: options.workspaceId,
      actor: options.actor,
      action: options.action,
      target: options.target,
      data: options.data ?? {},
    });
  } catch (err) {
    console.error("[MCP Audit Log Error]:", err);
  }

  return auditId;
}
