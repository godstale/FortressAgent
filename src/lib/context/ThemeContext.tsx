import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// TODO(Phase4): persist to SQLite app_settings instead of localStorage

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const STORAGE_KEY = 'fortress-theme';

function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
}

// Module load time dark-first initialization to avoid FOUC
if (typeof document !== 'undefined') {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    applyTheme(saved || 'dark');
  } catch {
    applyTheme('dark');
  }
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen to system preference changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      console.error('Failed to save theme to localStorage:', err);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
