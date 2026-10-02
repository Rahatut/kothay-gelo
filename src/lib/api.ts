const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ?? '/v1';

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

export const authApi = {
  register: (email: string, password: string) =>
    apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () =>
    apiFetch('/auth/logout', { method: 'POST' }),
  session: () =>
    apiFetch('/auth/session'),
  hasAccount: () =>
    apiFetch('/auth/has-account'),
  deleteAccount: () =>
    apiFetch('/auth/delete-account', { method: 'POST' }),
};