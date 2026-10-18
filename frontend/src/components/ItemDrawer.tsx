import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import { ApiError } from "../api/client";
import {
  addComment,
  claimItem,
  fetchItem,
  patchItem,
  transitionItem,
} from "../api/items";
import type { WorkItemPriority, WorkItemStatus } from "../api/types";
import { formatDate, prettyEnum } from "../lib/format";
import { PRIORITIES, STATUS_TRANSITIONS, transitionLabel } from "../lib/workflow";
import { PriorityBadge, StatusBadge, TypeBadge, VersionBadge } from "./Badges";

type Props = {
  itemId: string;
  onClose: () => void;
};

function valuePreview(value: Record<string, unknown> | null): string {
  if (!value) return "—";
  const entries = Object.entries(value);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${v === null || v === undefined ? "null" : String(v)}`)
    .join(", ");
}

export function ItemDrawer({ itemId, onClose }: Props) {
  const queryClient = useQueryClient();
  const itemQuery = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => fetchItem(itemId),
  });

  const item = itemQuery.data;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkItemPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [comment, setComment] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description);
    setPriority(item.priority);
    setDueDate(item.dueDate ? item.dueDate.slice(0, 16) : "");
  }, [item]);

  function handleMutationError(err: unknown, action: string) {
    if (err instanceof ApiError && err.status === 409) {
      setForbidden(null);
      setConflict(
        "Concurrency Conflict (409): Another user modified or claimed this work item while you were viewing an older version.",
      );
      return;
    }
    if (err instanceof ApiError && err.status === 403) {
      setConflict(null);
      setForbidden(
        `Server Authorization Error (403): The server rejected ${action}. Your current role cannot perform this mutation (VIEWER cannot edit; MEMBER cannot approve AWAITING_APPROVAL).`,
      );
      return;
    }
    setForbidden(err instanceof Error ? err.message : "Request failed");
  }

  async function refreshLists() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["items"] }),
      queryClient.invalidateQueries({ queryKey: ["item", itemId] }),
      queryClient.invalidateQueries({ queryKey: ["approval-count"] }),
    ]);
  }

  const claimMut = useMutation({
    mutationFn: () => claimItem(itemId),
    onSuccess: async () => {
      setConflict(null);
      setForbidden(null);
      await refreshLists();
    },
    onError: (err) => handleMutationError(err, "claim"),
  });

  const patchMut = useMutation({
    mutationFn: () =>
      patchItem(itemId, {
        version: item!.version,
        title,
        description,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    onSuccess: async () => {
      setConflict(null);
      setForbidden(null);
      await refreshLists();
    },
    onError: (err) => handleMutationError(err, "edit"),
  });

  const staleMut = useMutation({
    mutationFn: () =>
      patchItem(itemId, {
        version: Math.max(0, (item?.version ?? 1) - 1),
        title: `${item?.title ?? title} (stale write)`,
      }),
    onSuccess: async () => {
      setConflict(null);
      await refreshLists();
    },
    onError: (err) => handleMutationError(err, "stale edit"),
  });

  const transitionMut = useMutation({
    mutationFn: (targetStatus: WorkItemStatus) =>
      transitionItem(itemId, targetStatus, item!.version),
    onSuccess: async () => {
      setConflict(null);
      setForbidden(null);
      await refreshLists();
    },
    onError: (err) => handleMutationError(err, "workflow transition"),
  });

  const commentMut = useMutation({
    mutationFn: () => addComment(itemId, comment),
    onSuccess: async () => {
      setComment("");
      setForbidden(null);
      await queryClient.invalidateQueries({ queryKey: ["item", itemId] });
    },
    onError: (err) => handleMutationError(err, "comment"),
  });

  const nextStatuses = item ? STATUS_TRANSITIONS[item.status] : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
      <button className="h-full flex-1 cursor-default" onClick={onClose} aria-label="Close drawer" />
      <aside className="flex h-full w-full max-w-5xl flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Work item</div>
            <h2 className="text-xl font-semibold text-white">
              {item?.title ?? "Loading…"}
            </h2>
            {item && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TypeBadge type={item.type} />
                <PriorityBadge priority={item.priority} />
                <StatusBadge status={item.status} />
                <VersionBadge version={item.version} />
                <span className="text-xs text-slate-400">{item.team.name}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X />
          </button>
        </div>

        {conflict && (
          <div className="mx-5 mt-4 flex items-start gap-3 rounded-xl border border-amber-500 bg-amber-950/80 px-4 py-3 text-amber-100">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div className="flex-1 text-sm">
              {conflict}{" "}
              <button
                type="button"
                className="font-semibold text-white underline"
                onClick={() => {
                  setConflict(null);
                  void itemQuery.refetch();
                }}
              >
                [Reload Latest Server State]
              </button>
            </div>
          </div>
        )}
        {forbidden && (
          <div className="mx-5 mt-4 flex items-start gap-3 rounded-xl border border-rose-500 bg-rose-950/80 px-4 py-3 text-rose-100">
            <ShieldAlert className="mt-0.5 shrink-0" size={18} />
            <div className="text-sm">{forbidden}</div>
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-2">
          <section className="overflow-auto border-b border-slate-800 p-5 scrollbar-thin lg:border-b-0 lg:border-r">
            {itemQuery.isLoading && <p className="text-slate-400">Loading item…</p>}
            {itemQuery.error && (
              <p className="text-rose-300">
                {itemQuery.error instanceof Error
                  ? itemQuery.error.message
                  : "Failed to load item"}
              </p>
            )}
            {item && (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Assignee</dt>
                    <dd className="text-slate-100">
                      {item.assignee?.name ?? "Unassigned"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created by</dt>
                    <dd className="text-slate-100">{item.createdBy.name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Due</dt>
                    <dd className="text-slate-100">{formatDate(item.dueDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Updated</dt>
                    <dd className="text-slate-100">{formatDate(item.updatedAt)}</dd>
                  </div>
                </dl>

                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                  {item.description || "No description"}
                </p>

                {!item.assignee && (
                  <button
                    type="button"
                    onClick={() => claimMut.mutate()}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    {claimMut.isPending ? "Claiming…" : "Claim This Item"}
                  </button>
                )}

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Workflow state machine
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => transitionMut.mutate(status)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          status === "RESOLVED" && item.status === "AWAITING_APPROVAL"
                            ? "bg-amber-600 text-white hover:bg-amber-500"
                            : "border border-slate-700 bg-slate-900 text-slate-100 hover:border-indigo-500"
                        }`}
                      >
                        {transitionLabel(item.status, status)}
                      </button>
                    ))}
                    {nextStatuses.length === 0 && (
                      <span className="text-sm text-slate-500">No further transitions</span>
                    )}
                  </div>
                </div>

                <form
                  className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    patchMut.mutate();
                  }}
                >
                  <h3 className="text-sm font-semibold text-white">
                    Edit (optimistic lock · sending version {item.version})
                  </h3>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as WorkItemPriority)
                      }
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      {patchMut.isPending ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => staleMut.mutate()}
                      className="rounded-lg border border-amber-600/60 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-950"
                    >
                      Test Concurrency (send stale version)
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          <section className="flex min-h-0 flex-col p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Activity history
            </h3>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 scrollbar-thin">
              {(item?.activityEvents ?? []).map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-indigo-200">
                      {prettyEnum(event.eventType)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatDate(event.createdAt)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{event.actor.name}</div>
                  <div className="mt-1 text-xs text-slate-300">
                    {valuePreview(event.oldValue)}{" "}
                    <span className="text-slate-500">→</span>{" "}
                    {valuePreview(event.newValue)}
                  </div>
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) commentMut.mutate();
              }}
            >
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment…"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              />
              <button
                type="submit"
                disabled={!comment.trim() || commentMut.isPending}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </section>
        </div>
      </aside>
    </div>
  );
}
