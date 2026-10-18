import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { createItem } from "../api/items";
import type { AuthUser, WorkItemPriority, WorkItemType } from "../api/types";
import { PRIORITIES, TYPES } from "../lib/workflow";
import { prettyEnum } from "../lib/format";

type Props = {
  user: AuthUser;
  onClose: () => void;
  onCreated: (id: string) => void;
};

export function CreateItemModal({ user, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(user.memberships[0]?.teamId ?? "");
  const [type, setType] = useState<WorkItemType>("TASK");
  const [priority, setPriority] = useState<WorkItemPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createItem(
        {
          title,
          description,
          teamId,
          type,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        },
        idempotencyKey,
      ),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      onCreated(item.id);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Create failed");
    },
  });

  async function simulateDoubleClick() {
    setError(null);
    setInfo(null);
    const payload = {
      title,
      description,
      teamId,
      type,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    const [first, second] = await Promise.all([
      createItem(payload, idempotencyKey),
      createItem(payload, idempotencyKey),
    ]);
    const same = first.id === second.id;
    setInfo(
      same
        ? `Idempotency passed — both submissions returned item ${first.id.slice(0, 8)}.`
        : "Unexpected: two different items were created.",
    );
    await queryClient.invalidateQueries({ queryKey: ["items"] });
    if (same) onCreated(first.id);
  }

  const canSubmit = title.trim().length > 0 && teamId && !mutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Create work item</h2>
            <p className="text-xs text-slate-400">
              Idempotency-Key:{" "}
              <span className="font-mono text-indigo-300">{idempotencyKey}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="grid gap-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-slate-300">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-indigo-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Team</span>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {user.memberships.map((m) => (
                  <option key={m.teamId} value={m.teamId}>
                    {m.teamName}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WorkItemType)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {prettyEnum(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as WorkItemPriority)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-slate-300">Due date</span>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </label>
          </div>
          {error && (
            <div className="rounded-lg border border-rose-700 bg-rose-950/70 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg border border-emerald-700 bg-emerald-950/70 px-3 py-2 text-sm text-emerald-200">
              {info}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void simulateDoubleClick()}
              className="rounded-lg border border-amber-600/50 bg-amber-950 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900 disabled:opacity-50"
            >
              Simulate Double-Click (Test Idempotency)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? "Creating…" : "Create item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
