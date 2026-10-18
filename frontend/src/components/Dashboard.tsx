import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { claimItem, fetchItems } from "../api/items";
import type {
  AuthUser,
  DashboardView,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "../api/types";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDate, prettyEnum, shortId } from "../lib/format";
import { PRIORITIES, STATUSES, TYPES } from "../lib/workflow";
import {
  PriorityBadge,
  StatusBadge,
  TypeBadge,
  VersionBadge,
} from "./Badges";
import { CreateItemModal } from "./CreateItemModal";
import { ItemDrawer } from "./ItemDrawer";
import { ApiError } from "../api/client";

type Props = { user: AuthUser };

export function Dashboard({ user }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<DashboardView>("all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 350);
  const [status, setStatus] = useState<WorkItemStatus | "">("");
  const [priority, setPriority] = useState<WorkItemPriority | "">("");
  const [type, setType] = useState<WorkItemType | "">("");
  const [teamId, setTeamId] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const isApprover = user.memberships.some(
    (m) => m.role === "LEAD" || m.role === "ADMIN",
  );

  const listQuery = useMemo(
    () => ({
      view,
      q: debouncedQ.trim(),
      status,
      priority,
      type,
      teamId,
      cursor,
      limit: 25,
    }),
    [view, debouncedQ, status, priority, type, teamId, cursor],
  );

  const items = useQuery({
    queryKey: ["items", listQuery],
    queryFn: () => fetchItems(listQuery),
  });

  const approvalCount = useQuery({
    queryKey: ["approval-count"],
    queryFn: () =>
      fetchItems({ view: "awaiting_approval", limit: 1 }).then((d) => d.totalCount),
    enabled: isApprover,
  });

  const claimMut = useMutation({
    mutationFn: (id: string) => claimItem(id),
    onSuccess: async () => {
      setTableError(null);
      await queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setTableError(
          "Concurrency Conflict (409): This item was claimed or changed by another user. Reload the list.",
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setTableError(
          "Server Authorization Error (403): Your role cannot claim this item.",
        );
      } else {
        setTableError(err instanceof Error ? err.message : "Claim failed");
      }
    },
  });

  const tabs: { id: DashboardView; label: string }[] = [
    { id: "all", label: "All Accessible Items" },
    { id: "assigned_to_me", label: "Assigned to Me" },
    { id: "unassigned_urgent", label: "Unassigned Urgent" },
    { id: "awaiting_approval", label: "Awaiting My Approval" },
  ];

  function changeView(next: DashboardView) {
    setView(next);
    setCursor(null);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Operations overview</h1>
          <p className="text-sm text-slate-400">
            Server-side filters and cursor pagination — the browser never loads the full dataset.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          <Plus size={16} />
          New work item
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => changeView(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                active
                  ? "border-indigo-400 bg-indigo-600 text-white"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
              }`}
            >
              {tab.label}
              {tab.id === "awaiting_approval" && isApprover && (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">
                  {approvalCount.data ?? "…"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 md:grid-cols-6">
        <label className="relative md:col-span-2">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(null);
            }}
            placeholder="Search title or description"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white"
          />
        </label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as WorkItemStatus | "");
            setCursor(null);
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {prettyEnum(s)}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value as WorkItemPriority | "");
            setCursor(null);
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as WorkItemType | "");
            setCursor(null);
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {prettyEnum(t)}
            </option>
          ))}
        </select>
        <select
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value);
            setCursor(null);
          }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">All teams</option>
          {user.memberships.map((m) => (
            <option key={m.teamId} value={m.teamId}>
              {m.teamName}
            </option>
          ))}
        </select>
      </div>

      {tableError && (
        <div className="mb-3 rounded-lg border border-amber-600 bg-amber-950/70 px-3 py-2 text-sm text-amber-100">
          {tableError}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Title & ID</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Team</th>
                <th className="px-3 py-3">Assignee</th>
                <th className="px-3 py-3">Ver</th>
                <th className="px-3 py-3">Due</th>
                <th className="px-3 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    Loading work items…
                  </td>
                </tr>
              )}
              {items.data?.items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-100">{item.title}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {shortId(item.id)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <TypeBadge type={item.type} />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-3 py-3 text-slate-300">{item.team.name}</td>
                  <td className="px-3 py-3">
                    {item.assignee ? (
                      <span className="text-slate-200">{item.assignee.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          claimMut.mutate(item.id);
                        }}
                        className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                      >
                        Claim
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <VersionBadge version={item.version} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                    {formatDate(item.dueDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                    {formatDate(item.updatedAt)}
                  </td>
                </tr>
              ))}
              {items.data && items.data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    No work items match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
          <div>
            Showing {items.data?.items.length ?? 0} of {items.data?.totalCount ?? 0}{" "}
            matching items
            {cursor ? " (next page)" : ""}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!cursor}
              onClick={() => setCursor(null)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 disabled:opacity-40"
            >
              Previous (Reset)
            </button>
            <button
              type="button"
              disabled={!items.data?.hasMore || !items.data.nextCursor}
              onClick={() => setCursor(items.data?.nextCursor ?? null)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-900 disabled:opacity-40"
            >
              Next Page
            </button>
          </div>
        </div>
      </div>

      {createOpen && (
        <CreateItemModal
          user={user}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            setSelectedId(id);
          }}
        />
      )}
      {selectedId && (
        <ItemDrawer itemId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
