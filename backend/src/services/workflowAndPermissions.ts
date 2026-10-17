/**
 * Central workflow rules and team-scoped role-permission matrix.
 * Keep all transition and permission logic here for live demos and easy modification.
 */

import type { MembershipRole, WorkItemStatus } from "@prisma/client";

export type Permission =
  | "work_item:read"
  | "work_item:create"
  | "work_item:update"
  | "work_item:assign"
  | "work_item:change_status"
  | "work_item:change_priority"
  | "work_item:comment"
  | "work_item:approve"
  | "team:manage_members";

const ROLE_PERMISSIONS: Record<MembershipRole, readonly Permission[]> = {
  VIEWER: ["work_item:read"],
  MEMBER: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:comment",
    "work_item:change_status",
  ],
  LEAD: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:assign",
    "work_item:comment",
    "work_item:change_status",
    "work_item:change_priority",
    "work_item:approve",
  ],
  ADMIN: [
    "work_item:read",
    "work_item:create",
    "work_item:update",
    "work_item:assign",
    "work_item:comment",
    "work_item:change_status",
    "work_item:change_priority",
    "work_item:approve",
    "team:manage_members",
  ],
};

/** Allowed status transitions (from -> to). */
const STATUS_TRANSITIONS: Record<WorkItemStatus, readonly WorkItemStatus[]> = {
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["AWAITING_APPROVAL", "RESOLVED", "OPEN", "CLOSED"],
  AWAITING_APPROVAL: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["OPEN"],
};

export function roleHasPermission(
  role: MembershipRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canTransitionStatus(
  from: WorkItemStatus,
  to: WorkItemStatus,
): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
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
