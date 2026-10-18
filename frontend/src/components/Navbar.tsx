import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Shield, Users } from "lucide-react";
import { fetchDemoUsers } from "../api/auth";
import { useAuth } from "../auth/AuthProvider";
import { RoleBadge } from "./Badges";

export function Navbar() {
  const { user, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const demoUsers = useQuery({
    queryKey: ["demo-users"],
    queryFn: fetchDemoUsers,
  });

  async function switchTo(email: string) {
    setSwitching(email);
    try {
      await login(email);
      setOpen(false);
    } finally {
      setSwitching(null);
    }
  }

  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-900/40">
            <Shield size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">
              AegisOps
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
              Operational Coordination Portal
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex">
          <div className="truncate text-sm text-slate-200">
            <span className="font-medium text-white">{user.name}</span>
            <span className="mx-2 text-slate-600">·</span>
            <span className="text-slate-400">{user.email}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden max-w-xl flex-wrap justify-end gap-1 md:flex">
            {user.memberships.map((m) => (
              <RoleBadge key={m.teamId} teamName={m.teamName} role={m.role} />
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-950/40 hover:bg-indigo-500"
            >
              <Users size={16} />
              Switch Demo Role
              <ChevronDown size={14} />
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-[360px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-wider text-slate-400">
                  Seeded users — one click, no credentials
                </div>
                <div className="max-h-[420px] overflow-auto scrollbar-thin">
                  {(demoUsers.data ?? []).map((demo) => {
                    const active = demo.email === user.email;
                    return (
                      <button
                        key={demo.id}
                        type="button"
                        disabled={switching === demo.email}
                        onClick={() => void switchTo(demo.email)}
                        className={`flex w-full flex-col gap-1 border-b border-slate-800 px-3 py-2.5 text-left last:border-0 hover:bg-slate-800 ${
                          active ? "bg-indigo-950/50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">
                            {demo.name}
                          </span>
                          {active && (
                            <span className="text-[10px] font-semibold uppercase text-indigo-300">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{demo.email}</span>
                        <div className="flex flex-wrap gap-1">
                          {demo.memberships.map((m) => (
                            <RoleBadge
                              key={`${demo.id}-${m.teamId}`}
                              teamName={m.teamName}
                              role={m.role}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
