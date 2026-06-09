import { v4 as uuidv4 } from "uuid";

const TOKEN_KEY = "abm.token";
const USER_KEY = "abm.user";
const CLIENT_ID_KEY = "abm.clientId";

export interface UserSession {
  id: string;
  name: string;
  email: string;
  client_id: string;
  initials: string;
}

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getActiveUser(): UserSession | null {
  return readJson<UserSession>(USER_KEY);
}

export function getActiveClientId(): string {
  const stored = storage()?.getItem(CLIENT_ID_KEY);
  if (stored) return stored;
  // Fallback for unauthenticated / dev use only
  const id = uuidv4();
  storage()?.setItem(CLIENT_ID_KEY, id);
  return id;
}

export function setSession(token: string, user: UserSession): void {
  const store = storage();
  store?.setItem(TOKEN_KEY, token);
  store?.setItem(CLIENT_ID_KEY, user.client_id);
  store?.setItem(USER_KEY, JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  return !!getToken() && !!getActiveUser();
}

export function clearSession(): void {
  const local = storage();
  const session = typeof window === "undefined" ? null : window.sessionStorage;
  const keys = [TOKEN_KEY, USER_KEY, CLIENT_ID_KEY];
  keys.forEach((k) => {
    local?.removeItem(k);
    session?.removeItem(k);
  });
}
