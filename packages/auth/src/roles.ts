export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  OWNER: 40,
  ADMIN: 30,
  MEMBER: 20,
  VIEWER: 10,
};

/**
 * Checks whether userRole is at least requiredRole according to the role hierarchy.
 * OWNER > ADMIN > MEMBER > VIEWER.
 */
export function hasMinRole(userRole: string | undefined | null, requiredRole: WorkspaceRole): boolean {
  if (!userRole) return false;
  const userRank = ROLE_HIERARCHY[userRole as WorkspaceRole] ?? 0;
  const reqRank = ROLE_HIERARCHY[requiredRole] ?? 999;
  return userRank >= reqRank;
}
