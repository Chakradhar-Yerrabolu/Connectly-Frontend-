export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Keep auth cookies first-party by routing auth requests through this Next.js origin.
function authEndpoint(path: string) {
  return path.startsWith('/api/v1/auth/') ? path : `${API}${path}`;
}

let accessToken: string | null = null;
let csrfTokenCache: string | null = null;
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

export type AuthResponse = { accessToken: string; user: AuthUser; csrfToken?: string };

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  tokenListeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: (token: string | null) => void) {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(target)) {
      try {
        return decodeURIComponent(value.slice(target.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function obtainCsrfToken(): Promise<string | null> {
  if (csrfTokenCache) return csrfTokenCache;

  const cookieToken = readCookie('connectly_csrf');
  if (cookieToken) {
    csrfTokenCache = cookieToken;
    return cookieToken;
  }

  const response = await fetch(authEndpoint('/api/v1/auth/csrf'), {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await parseResponse(response) as { csrfToken?: string } | null;

  if (!response.ok || typeof data?.csrfToken !== 'string' || !data.csrfToken) {
    throw new ApiError(
      response.status || 502,
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error?: string }).error || 'Could not obtain CSRF token')
        : 'Could not obtain CSRF token',
    );
  }

  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
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

function isAuthResponse(value: unknown): value is AuthResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<AuthResponse>;
  return typeof response.accessToken === 'string' && Boolean(response.user);
}

export async function refreshSession(): Promise<AuthResponse | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const headers = new Headers();
      const csrf = await obtainCsrfToken();
      if (csrf) headers.set('X-CSRF-Token', csrf);

      const response = await fetch(authEndpoint('/api/v1/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers,
        cache: 'no-store',
      });
      const data = await parseResponse(response);

      if (!response.ok) {
        if (response.status === 401) {
          setAccessToken(null);
          csrfTokenCache = null;
          return null;
        }

        const errorData = data as { error?: string; code?: string } | null;
        throw new ApiError(
          response.status,
          errorData?.error || 'Could not restore your session',
          errorData?.code,
          data,
        );
      }

      if (!isAuthResponse(data)) {
        throw new ApiError(502, 'The session restore response was invalid');
      }

      if (data.csrfToken) csrfTokenCache = data.csrfToken;
      setAccessToken(data.accessToken);
      return data;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown; skipRefresh?: boolean };

function createRequestHeaders(headers: HeadersInit | undefined, body: unknown) {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }
  const csrf = csrfTokenCache || readCookie('connectly_csrf');
  if (csrf) requestHeaders.set('X-CSRF-Token', csrf);
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  return requestHeaders;
}

async function request<T>(path: string, body: unknown, rest: RequestInit, headers: HeadersInit | undefined) {
  const requestUrl = path.startsWith('/api/v1/auth/') ? authEndpoint(path) : `${API}${path}`;
  const response = await fetch(requestUrl, {
    ...rest,
    credentials: 'include',
    headers: createRequestHeaders(headers, body),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  return { response, data: await parseResponse(response) as T };
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, skipRefresh, headers, ...rest } = options;
  const { response, data } = await request<T>(path, body, rest, headers);

  if (response.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retry = await request<T>(path, body, rest, headers);
      if (!retry.response.ok) {
        const errorData = retry.data as { error?: string; code?: string };
        throw new ApiError(retry.response.status, errorData?.error || 'Request failed', errorData?.code, retry.data);
      }
      return retry.data;
    }
  }

  if (!response.ok) {
    const errorData = data as { error?: string; code?: string };
    throw new ApiError(response.status, errorData?.error || 'Request failed', errorData?.code, data);
  }
  return data;
}

export async function loginWithPassword(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(authEndpoint('/api/v1/auth/login'), {
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
  if (!isAuthResponse(data)) throw new ApiError(502, 'The login response was invalid');
  if (data.csrfToken) csrfTokenCache = data.csrfToken;
  setAccessToken(data.accessToken);
  return data;
}

export async function registerAccount(input: {
  username: string;
  displayName: string;
  password: string;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY';
}) {
  const response = await fetch(authEndpoint('/api/v1/auth/register'), {
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
  try {
    const headers = new Headers();
    const csrf = await obtainCsrfToken().catch(() => null);
    if (csrf) headers.set('X-CSRF-Token', csrf);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(authEndpoint('/api/v1/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers,
    });
    if (!response.ok && response.status !== 401 && response.status !== 403) {
      const data = await parseResponse(response);
      const errorData = data as { error?: string; code?: string };
      throw new ApiError(
        response.status,
        errorData?.error || 'Could not sign out',
        errorData?.code,
        data,
      );
    }
  } finally {
    setAccessToken(null);
    csrfTokenCache = null;
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
