import { describe, expect, it } from "vitest";
import {
  canTransitionStatus,
  roleHasPermission,
} from "./workflowAndPermissions.js";

describe("workflowAndPermissions", () => {
  it("VIEWER can read but not create", () => {
    expect(roleHasPermission("VIEWER", "work_item:read")).toBe(true);
    expect(roleHasPermission("VIEWER", "work_item:create")).toBe(false);
  });

  it("allows OPEN -> IN_PROGRESS", () => {
    expect(canTransitionStatus("OPEN", "IN_PROGRESS")).toBe(true);
  });

  it("disallows OPEN -> RESOLVED", () => {
    expect(canTransitionStatus("OPEN", "RESOLVED")).toBe(false);
  });
});
