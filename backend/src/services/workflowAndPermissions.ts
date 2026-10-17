/**
 * Central workflow rules and team-scoped role-permission matrix.
 * Keep all transition and permission logic here for live demos and easy modification.
 */

import type { MembershipRole, WorkItemStatus } from "@prisma/client";
import type { AuthUser } from "../lib/authUser.js";
import { HttpError } from "../lib/httpError.js";

export type Permission =
  | "work_item:read"
  | "work_item:create"
  | "work_item:update"
  | "work_item:claim"
  | "work_item:assign"
  | "work_item:change_status"
  | "work_item:change_priority"
  | "work_item:comment"
  | "work_item:approve"
  | "work_item:close"
  | "work_item:reopen"
  | "team:manage_members";

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  VIEWER: ["work_item:read"],
  MEMBER: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:claim",
    "work_item:comment",
    "work_item:change_status",
    "work_item:change_priority",
  ],
  LEAD: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:claim",
    "work_item:assign",
    "work_item:comment",
    "work_item:change_status",
    "work_item:change_priority",
    "work_item:approve",
    "work_item:close",
    "work_item:reopen",
  ],
  ADMIN: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:claim",
    "work_item:assign",
    "work_item:comment",
    "work_item:change_status",
    "work_item:change_priority",
    "work_item:approve",
    "work_item:close",
    "work_item:reopen",
    "team:manage_members",
  ],
};

/**
 * Valid status graph. Invalid jumps (e.g. OPEN -> CLOSED) are 400 Bad Request.
 * LEAD/ADMIN-only edges are enforced separately (403 Forbidden).
 */
const STATUS_TRANSITIONS: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["AWAITING_APPROVAL", "RESOLVED"],
  AWAITING_APPROVAL: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: ["OPEN"],
};

const LEAD_ONLY_TRANSITIONS = new Set<string>([
  "AWAITING_APPROVAL->RESOLVED",
  "RESOLVED->CLOSED",
  "CLOSED->OPEN",
]);

export function isGlobalAdmin(user: AuthUser): boolean {
  return user.memberships.some((m) => m.role === "ADMIN");
}

export function accessibleTeamIds(user: AuthUser): string[] | null {
  if (isGlobalAdmin(user)) return null;
  return user.memberships.map((m) => m.teamId);
}

export function roleOnTeam(
  user: AuthUser,
  teamId: string,
): MembershipRole | null {
  const membership = user.memberships.find((m) => m.teamId === teamId);
  if (membership) return membership.role;
  if (isGlobalAdmin(user)) return "ADMIN";
  return null;
}

export function assertTeamAccess(
  user: AuthUser,
  teamId: string,
): MembershipRole {
  const role = roleOnTeam(user, teamId);
  if (!role) {
    throw new HttpError(403, "Forbidden");
  }
  return role;
}

export function roleHasPermission(
  role: MembershipRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(
  role: MembershipRole,
  permission: Permission,
): void {
  if (!roleHasPermission(role, permission)) {
    throw new HttpError(403, "Forbidden");
  }
}

export function canTransitionStatus(
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function isLeadOnlyTransition(
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  return LEAD_ONLY_TRANSITIONS.has(`${from}->${to}`);
}

/**
 * Returns how a transition should be rejected, or null if the role may perform it.
 * Invalid graph edges → 400. Legal edges the role cannot take → 403.
 */
export function transitionRejection(
  role: MembershipRole,
  from: WorkItemStatus,
  to: WorkItemStatus,
): { status: 400 | 403; message: string } | null {
  if (!canTransitionStatus(from, to)) {
    return {
      status: 400,
      message: `Invalid workflow transition ${from} -> ${to}`,
    };
  }
  if (!roleHasPermission(role, "work_item:change_status")) {
    return { status: 403, message: "Forbidden" };
  }
  if (isLeadOnlyTransition(from, to)) {
    const needed: Permission =
      from === "AWAITING_APPROVAL"
        ? "work_item:approve"
        : from === "RESOLVED"
          ? "work_item:close"
          : "work_item:reopen";
    if (!roleHasPermission(role, needed)) {
      return { status: 403, message: "Forbidden" };
    }
  }
  return null;
}

export function getAllowedNextStatuses(
  current: WorkItemStatus,
): readonly WorkItemStatus[] {
  return STATUS_TRANSITIONS[current];
}

export function getPermissionsForRole(
  role: MembershipRole,
): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
