'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  apiFetch,
  accessTokenExpiresAt,
  getAccessToken,
  loginWithPassword,
  logoutRequest,
  onAccessTokenChange,
  refreshSession,
  registerAccount,
  setAccessToken,
  type AuthUser,
} from './lib/api';

export type Theme = 'light' | 'dark' | 'github';
export const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: 'light', label: 'Light', description: 'Clean, bright and comfortable' },
  { id: 'dark', label: 'Dark', description: 'Charcoal surfaces with soft contrast' },
  { id: 'github', label: 'GitHub', description: 'GitHub-inspired neutrals and blue accents' },
];
const THEME_KEY = 'connectly-theme';

type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'github';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) : null;
    const initial = isTheme(stored) ? stored : 'light';
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
    document.documentElement.style.colorScheme = initial === 'light' ? 'light' : 'dark';
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_KEY && isTheme(event.newValue)) {
        setThemeState(event.newValue);
        document.documentElement.dataset.theme = event.newValue;
        document.documentElement.style.colorScheme = event.newValue === 'light' ? 'light' : 'dark';
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage may be unavailable; the theme still applies for this session.
    }
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next === 'light' ? 'light' : 'dark';
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export type ToastInput = { type: ToastKind; message: string; title?: string; key?: string; duration?: number };
type Toast = ToastInput & { id: string };

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
  success: (message: string, key?: string, title?: string) => void;
  error: (message: string, key?: string, title?: string) => void;
  warning: (message: string, key?: string, title?: string) => void;
  info: (message: string, key?: string, title?: string) => void;
  dismissToast: (id: string) => void;
};
const ToastContext = createContext<ToastContextValue | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastState = useRef<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    toastState.current = toastState.current.filter((toast) => toast.id !== id);
    setToasts(toastState.current);
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const key = input.key || `${input.type}:${input.message}`;
      if (toastState.current.some((toast) => (toast.key || `${toast.type}:${toast.message}`) === key)) return;
      const id = `toast-${++toastCounter}`;
      const toast: Toast = { ...input, id, key };
      toastState.current = [...toastState.current.slice(-4), toast];
      setToasts(toastState.current);
      const duration = input.duration ?? (input.type === 'error' ? 6500 : 4200);
      const timer = setTimeout(() => dismissToast(id), duration);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      pushToast,
      dismissToast,
      success: (message, key, title) => pushToast({ type: 'success', message, key, title }),
      error: (message, key, title) => pushToast({ type: 'error', message, key, title }),
      warning: (message, key, title) => pushToast({ type: 'warning', message, key, title }),
      info: (message, key, title) => pushToast({ type: 'info', message, key, title }),
    }),
    [pushToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-mark" aria-hidden="true">
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '!' : toast.type === 'warning' ? '!' : 'i'}
            </span>
            <div className="toast-body">
              {toast.title && <strong>{toast.title}</strong>}
              <p>{toast.message}</p>
            </div>
            <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (input: { username: string; displayName: string; password: string; email: string; gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  clearSession: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAccessTokenChange(setToken);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((result) => {
        if (active && result) setUser(result.user);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const expiresAt = accessTokenExpiresAt(token);
    if (!expiresAt) return;
    const delay = Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 15_000);
    const timer = setTimeout(() => {
      refreshSession().then((result) => {
        if (result) setUser(result.user);
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !getAccessToken()) return;
      const expiresAt = accessTokenExpiresAt(getAccessToken()!);
      if (expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) {
        refreshSession().then((result) => {
          if (result) setUser(result.user);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginWithPassword(username, password);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(
    async (input: { username: string; displayName: string; password: string; email: string; gender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' }) => {
      await registerAccount(input);
      const result = await loginWithPassword(input.username, input.password);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/logout-all', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await apiFetch<AuthUser>('/api/v1/auth/me');
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, logoutAll, refreshUser, setUser, clearSession }),
    [user, token, loading, login, register, logout, logoutAll, refreshUser, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
