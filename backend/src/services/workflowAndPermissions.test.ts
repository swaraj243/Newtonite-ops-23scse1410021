import { describe, expect, it } from "vitest";
import {
  canTransitionStatus,
  isLeadOnlyTransition,
  roleHasPermission,
  transitionRejection,
} from "./workflowAndPermissions.js";

describe("workflowAndPermissions", () => {
  it("VIEWER can read but not create", () => {
    expect(roleHasPermission("VIEWER", "work_item:read")).toBe(true);
    expect(roleHasPermission("VIEWER", "work_item:create")).toBe(false);
  });

  it("allows OPEN -> IN_PROGRESS and IN_PROGRESS -> RESOLVED for members", () => {
    expect(canTransitionStatus("OPEN", "IN_PROGRESS")).toBe(true);
    expect(transitionRejection("MEMBER", "OPEN", "IN_PROGRESS")).toBeNull();
    expect(transitionRejection("MEMBER", "IN_PROGRESS", "RESOLVED")).toBeNull();
  });

  it("rejects invalid jumps with 400", () => {
    expect(canTransitionStatus("OPEN", "CLOSED")).toBe(false);
    expect(transitionRejection("LEAD", "OPEN", "CLOSED")?.status).toBe(400);
    expect(transitionRejection("MEMBER", "OPEN", "RESOLVED")?.status).toBe(400);
  });

  it("rejects MEMBER approval with 403", () => {
    expect(isLeadOnlyTransition("AWAITING_APPROVAL", "RESOLVED")).toBe(true);
    expect(
      transitionRejection("MEMBER", "AWAITING_APPROVAL", "RESOLVED")?.status,
    ).toBe(403);
    expect(
      transitionRejection("LEAD", "AWAITING_APPROVAL", "RESOLVED"),
    ).toBeNull();
  });

  it("VIEWER cannot comment or transition", () => {
    expect(roleHasPermission("VIEWER", "work_item:comment")).toBe(false);
    expect(transitionRejection("VIEWER", "OPEN", "IN_PROGRESS")?.status).toBe(
      403,
    );
  });
});
