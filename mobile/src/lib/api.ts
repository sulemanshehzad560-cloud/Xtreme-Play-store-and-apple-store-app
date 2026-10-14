import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import type { Session } from "./types";

const KEY = "xtreme.session";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let session: Session | null = null;
let refreshing: Promise<Session | null> | null = null;
const listeners = new Set<(s: Session | null) => void>();

export const getSession = () => session;

export function onSessionChange(fn: (s: Session | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function setSession(next: Session | null) {
  session = next;
  if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next));
  else await SecureStore.deleteItemAsync(KEY);
  listeners.forEach((fn) => fn(next));
}

export async function restoreSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  session = raw ? (JSON.parse(raw) as Session) : null;
  return session;
}

/**
 * Refresh tokens rotate and work once, so concurrent 401s must share one refresh call
 * (a second refresh with the same token would end the session).
 */
async function refresh(): Promise<Session | null> {
  if (!session) return null;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      });
      if (!res.ok) {
        await setSession(null);
        return null;
      }
      const tokens = (await res.json()) as Pick<Session, "accessToken" | "refreshToken">;
      const next = { ...session!, ...tokens };
      await setSession(next);
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}, retry = true): Promise<T> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && retry && session) {
    const next = await refresh();
    if (next) return api<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Something went wrong");
  }
  return data as T;
}

/** Current access token for the realtime socket, refreshed if it is about to expire. */
export async function freshAccessToken(): Promise<string | null> {
  if (!session) return null;
  try {
    const [, payload] = session.accessToken.split(".");
    const { exp } = JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp: number };
    if (exp * 1000 - Date.now() < 60_000) return (await refresh())?.accessToken ?? null;
  } catch {
    /* fall through */
  }
  return session.accessToken;
}
