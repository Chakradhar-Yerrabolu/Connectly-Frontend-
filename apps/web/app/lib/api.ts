export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  about?: string | null;
  gender?: string;
  profilePictureKey?: string | null;
};

export type AuthResponse = { accessToken: string; user: AuthUser };

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: (token: string | null) => void) {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(target)) return decodeURIComponent(value.slice(target.length));
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  constructor(status: number, message: string, code?: string, data?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function refreshSession(): Promise<AuthResponse | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const csrf = readCookie('connectly_csrf');
    if (!csrf) return null;
    try {
      const response = await fetch(`${API}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrf },
      });
      if (!response.ok) {
        setAccessToken(null);
        return null;
      }
      const data = (await parseResponse(response)) as AuthResponse;
      setAccessToken(data.accessToken);
      return data;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown; skipRefresh?: boolean };

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, skipRefresh, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API}${path}`, {
    ...rest,
    credentials: 'include',
    headers: requestHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (response.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retryHeaders = new Headers(headers);
      if (body !== undefined && !(body instanceof FormData)) retryHeaders.set('Content-Type', 'application/json');
      retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
      const retry = await fetch(`${API}${path}`, {
        ...rest,
        credentials: 'include',
        headers: retryHeaders,
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
      const retryData = await parseResponse(retry);
      if (!retry.ok) {
        const errorData = retryData as { error?: string; code?: string };
        throw new ApiError(retry.status, errorData?.error || 'Request failed', errorData?.code, retryData);
      }
      return retryData as T;
    }
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    const errorData = data as { error?: string; code?: string };
    throw new ApiError(response.status, errorData?.error || 'Request failed', errorData?.code, data);
  }
  return data as T;
}

export async function loginWithPassword(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, device: { deviceName: 'Web Browser', platform: 'WEB' } }),
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const errorData = data as { error?: string; code?: string };
    throw new ApiError(response.status, errorData?.error || 'Login failed', errorData?.code, data);
  }
  const auth = data as AuthResponse;
  setAccessToken(auth.accessToken);
  return auth;
}

export async function registerAccount(input: {
  username: string;
  displayName: string;
  password: string;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY';
}) {
  const response = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: input.username,
      displayName: input.displayName || input.username,
      password: input.password,
      email: input.email.trim().toLowerCase(),
      gender: input.gender,
      device: { deviceName: 'Web Browser', platform: 'WEB' },
    }),
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const errorData = data as { error?: string; code?: string };
    throw new ApiError(response.status, errorData?.error || 'Registration failed', errorData?.code, data);
  }
  return data;
}

export async function logoutRequest() {
  const csrf = readCookie('connectly_csrf');
  try {
    await fetch(`${API}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } finally {
    setAccessToken(null);
  }
}

export function accessTokenExpiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
