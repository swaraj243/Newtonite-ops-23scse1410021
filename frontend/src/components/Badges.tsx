import type {
  MembershipRole,
  WorkItemPriority,
  WorkItemStatus,
  WorkItemType,
} from "../api/types";
import { prettyEnum } from "../lib/format";

function pill(className: string, label: string) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${className}`}
    >
      {label}
    </span>
  );
}

export function TypeBadge({ type }: { type: WorkItemType }) {
  return pill("bg-slate-700/80 text-slate-100 border border-slate-600", prettyEnum(type));
}

export function PriorityBadge({ priority }: { priority: WorkItemPriority }) {
  const map: Record<WorkItemPriority, string> = {
    LOW: "bg-slate-700 text-slate-200 border border-slate-600",
    MEDIUM: "bg-sky-900/70 text-sky-200 border border-sky-700",
    HIGH: "bg-amber-900/80 text-amber-200 border border-amber-600",
    URGENT: "bg-rose-700 text-white border border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)]",
  };
  return pill(map[priority], priority);
}

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const map: Record<WorkItemStatus, string> = {
    OPEN: "bg-indigo-900/80 text-indigo-200 border border-indigo-600",
    IN_PROGRESS: "bg-cyan-900/80 text-cyan-200 border border-cyan-600",
    AWAITING_APPROVAL: "bg-violet-900/80 text-violet-100 border border-violet-500",
    RESOLVED: "bg-emerald-900/80 text-emerald-200 border border-emerald-600",
    CLOSED: "bg-slate-800 text-slate-300 border border-slate-600",
  };
  return pill(map[status], prettyEnum(status));
}

export function RoleBadge({
  teamName,
  role,
}: {
  teamName: string;
  role: MembershipRole;
}) {
  const roleColor: Record<MembershipRole, string> = {
    VIEWER: "bg-slate-700 text-slate-200",
    MEMBER: "bg-indigo-800 text-indigo-100",
    LEAD: "bg-amber-800 text-amber-100",
    ADMIN: "bg-rose-800 text-rose-100",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${roleColor[role]}`}
    >
      {teamName}: {role}
    </span>
  );
}

export function VersionBadge({ version }: { version: number }) {
  return pill("bg-slate-900 text-indigo-300 border border-indigo-700", `v${version}`);
}
