import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { DEFAULT_DEMO_EMAIL, fetchDemoUsers } from "../api/auth";
import { useAuth } from "../auth/AuthProvider";
import { RoleBadge } from "./Badges";

export function LoginCard() {
  const { login, error, loading } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const demoUsers = useQuery({
    queryKey: ["demo-users"],
    queryFn: fetchDemoUsers,
  });

  async function choose(email: string) {
    setBusy(email);
    setLocalError(null);
    try {
      await login(email);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Shield />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">AegisOps</h1>
            <p className="text-sm text-slate-400">
              Operational Coordination Portal
            </p>
          </div>
        </div>
        <p className="mb-4 text-sm text-slate-300">
          One-click demo login. Default session is{" "}
          <span className="font-mono text-indigo-300">{DEFAULT_DEMO_EMAIL}</span>
          .
        </p>
        {(error || localError) && (
          <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/60 px-3 py-2 text-sm text-amber-200">
            {localError ?? error}
          </div>
        )}
        <div className="grid gap-2">
          {(demoUsers.data ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={loading || busy !== null}
              onClick={() => void choose(u.email)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left hover:border-indigo-500 hover:bg-slate-800/80"
            >
              <div className="font-medium text-white">
                {u.name}{" "}
                <span className="font-normal text-slate-400">· {u.email}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {u.memberships.map((m) => (
                  <RoleBadge
                    key={m.teamId}
                    teamName={m.teamName}
                    role={m.role}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
