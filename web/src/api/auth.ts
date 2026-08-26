export const ACCESS_KEY_STORAGE = "noterelay_access_key";
export const AUTH_EXPIRED_EVENT = "noterelay-auth-expired";
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}

export function getAccessKey(): string | null {
  return (
    localStorage.getItem(ACCESS_KEY_STORAGE) ??
    sessionStorage.getItem(ACCESS_KEY_STORAGE)
  );
}

export function setAccessKey(key: string, remember: boolean) {
  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  otherStorage.removeItem(ACCESS_KEY_STORAGE);
  storage.setItem(ACCESS_KEY_STORAGE, key);
}

export function clearAccessKey() {
  localStorage.removeItem(ACCESS_KEY_STORAGE);
  sessionStorage.removeItem(ACCESS_KEY_STORAGE);
}

function notifyAuthExpired() {
  clearAccessKey();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export async function validateAccessKey(key: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/health`, {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
  } catch {
    throw new Error("network_error");
  }

  if (response.status === 401) {
    throw new AuthError();
  }

  if (!response.ok) {
    throw new Error("server_error");
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const key = getAccessKey();
  const headers = new Headers(init.headers);

  if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    notifyAuthExpired();
    throw new AuthError();
  }

  return response;
}
