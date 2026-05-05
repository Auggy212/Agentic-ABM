import { v4 as uuidv4 } from "uuid";

const AUTH_KEY = "abm.authenticated";
const USER_KEY = "abm.user";
const CLIENT_ID_KEY = "abm.clientId";

const TOKEN_KEYS = ["token", "authToken", "accessToken", "refreshToken"];

export interface DemoUserSession {
  name: string;
  org: string;
  role: string;
  initials: string;
  clientId: string;
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

export function getActiveClientId(): string {
  const store = storage();
  const existing = store?.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const clientId = uuidv4();
  store?.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}

export function setActiveClientId(clientId: string): void {
  storage()?.setItem(CLIENT_ID_KEY, clientId);
}

export function getActiveUser(): DemoUserSession {
  const existing = readJson<DemoUserSession>(USER_KEY);
  if (existing) {
    return { ...existing, clientId: existing.clientId || getActiveClientId() };
  }

  return {
    name: "Maya Okafor",
    org: "Sennen",
    role: "Admin",
    initials: "M",
    clientId: getActiveClientId(),
  };
}

export function startDemoSession(): DemoUserSession {
  const user = getActiveUser();
  const next = { ...user, clientId: user.clientId || getActiveClientId() };
  const store = storage();
  store?.setItem(AUTH_KEY, "true");
  store?.setItem(CLIENT_ID_KEY, next.clientId);
  store?.setItem(USER_KEY, JSON.stringify(next));
  return next;
}

export function clearSession(): void {
  const local = storage();
  const session = typeof window === "undefined" ? null : window.sessionStorage;

  for (const key of [AUTH_KEY, USER_KEY, CLIENT_ID_KEY, ...TOKEN_KEYS]) {
    local?.removeItem(key);
    session?.removeItem(key);
  }
}
