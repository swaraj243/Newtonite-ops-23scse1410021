import { api } from "./client";
import type {
  Comment,
  ItemsListResponse,
  ItemsQuery,
  WorkItemDetail,
  WorkItemListItem,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "./types";

export function fetchItems(query: ItemsQuery) {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit ?? 25));
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.type) params.set("type", query.type);
  if (query.teamId) params.set("teamId", query.teamId);
  if (query.view && query.view !== "all") params.set("view", query.view);
  return api<ItemsListResponse>(`/api/items?${params.toString()}`);
}

export function fetchItem(id: string) {
  return api<{ item: WorkItemDetail }>(`/api/items/${id}`).then((d) => d.item);
}

export type CreateItemPayload = {
  title: string;
  description: string;
  teamId: string;
  type: WorkItemType;
  priority: WorkItemPriority;
  dueDate?: string | null;
};

export function createItem(payload: CreateItemPayload, idempotencyKey: string) {
  return api<{ item: WorkItemListItem }>("/api/items", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
  }).then((d) => d.item);
}

export function claimItem(id: string) {
  return api<{ item: WorkItemListItem }>(`/api/items/${id}/claim`, {
    method: "POST",
  }).then((d) => d.item);
}

export type PatchItemPayload = {
  version: number;
  title?: string;
  description?: string;
  priority?: WorkItemPriority;
  dueDate?: string | null;
};

export function patchItem(id: string, payload: PatchItemPayload) {
  return api<{ item: WorkItemListItem }>(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((d) => d.item);
}

export function transitionItem(
  id: string,
  targetStatus: WorkItemStatus,
  version: number,
) {
  return api<{ item: WorkItemListItem }>(`/api/items/${id}/transition`, {
    method: "POST",
    body: JSON.stringify({ targetStatus, version }),
  }).then((d) => d.item);
}

export function addComment(id: string, body: string) {
  return api<{ comment: Comment }>(`/api/items/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }).then((d) => d.comment);
}
