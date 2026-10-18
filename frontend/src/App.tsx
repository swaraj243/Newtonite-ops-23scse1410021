import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Dashboard } from "./components/Dashboard";
import { LoginCard } from "./components/LoginCard";
import { Navbar } from "./components/Navbar";

function Shell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-950 text-slate-300">
        Starting AegisOps session…
      </div>
    );
  }

  if (!user) return <LoginCard />;

  return (
    <div className="min-h-full bg-slate-950">
      <Navbar />
      <Dashboard user={user} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
