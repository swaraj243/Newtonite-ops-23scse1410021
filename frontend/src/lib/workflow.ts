import type { WorkItemStatus } from "../api/types";

export const STATUS_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["AWAITING_APPROVAL", "RESOLVED"],
  AWAITING_APPROVAL: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: ["OPEN"],
};

export function transitionLabel(from: WorkItemStatus, to: WorkItemStatus): string {
  if (from === "OPEN" && to === "IN_PROGRESS") return "Start Progress";
  if (from === "IN_PROGRESS" && to === "AWAITING_APPROVAL") {
    return "Submit for Approval";
  }
  if (from === "IN_PROGRESS" && to === "RESOLVED") return "Resolve";
  if (from === "AWAITING_APPROVAL" && to === "RESOLVED") {
    return "Approve & Resolve (Lead Only)";
  }
  if (from === "RESOLVED" && to === "CLOSED") return "Close (Lead Only)";
  if (from === "CLOSED" && to === "OPEN") return "Reopen (Lead Only)";
  return `Move to ${to.replaceAll("_", " ")}`;
}

export const TYPES = [
  "INCIDENT",
  "CUSTOMER_ISSUE",
  "PAYMENT",
  "COMPLIANCE",
  "TASK",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "RESOLVED",
  "CLOSED",
] as const;
