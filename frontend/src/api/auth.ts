import { api, setToken } from "./client";
import type { AuthUser, DemoUser } from "./types";

export const DEMO_PASSWORD = "password123";
export const DEFAULT_DEMO_EMAIL = "lead.payments@newtonite.io";

export async function login(email: string, password = DEMO_PASSWORD) {
  const data = await api<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data.user;
}

export function fetchMe() {
  return api<{ user: AuthUser }>("/api/auth/me").then((d) => d.user);
}

export function fetchDemoUsers() {
  return api<{ users: DemoUser[] }>("/api/auth/demo-users").then((d) => d.users);
}
