import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_DEMO_EMAIL,
  fetchMe,
  login as loginRequest,
} from "../api/auth";
import { getToken, setToken } from "../api/client";
import type { AuthUser } from "../api/types";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback(
    async (nextUser: AuthUser) => {
      setUser(nextUser);
      setError(null);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string) => {
      const next = await loginRequest(email);
      await queryClient.clear();
      await applySession(next);
    },
    [applySession, queryClient],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    void queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        if (getToken()) {
          const me = await fetchMe();
          if (!cancelled) {
            setUser(me);
            setError(null);
          }
          return;
        }
        const next = await loginRequest(DEFAULT_DEMO_EMAIL);
        if (!cancelled) {
          setUser(next);
          setError(null);
        }
      } catch (err) {
        setToken(null);
        if (!cancelled) {
          setUser(null);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to start a demo session",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, logout }),
    [user, loading, error, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
