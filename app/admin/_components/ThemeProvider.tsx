"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "lhr_theme";

function systemTheme(): Theme {
  // Fall back to light when the platform reports no dark preference.
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // No saved preference: follow the system color scheme (light fallback).
  // Must match the no-flash inline script in app/layout.tsx.
  return systemTheme();
}

function persistTheme(next: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore quota / privacy-mode errors.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer so the first client render already reflects the saved
  // preference. (SSR output will be "dark", but `suppressHydrationWarning`
  // on <html> plus the inline script in RootLayout keeps DOM in sync so
  // users never see a flash.)
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Apply `data-theme` on every change. Persistence deliberately does NOT
  // live here: only explicit user choices (toggleTheme/setTheme) are saved,
  // so system-driven values never turn into a stored preference.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // Until the user picks a theme, follow live changes to the system scheme.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(e: MediaQueryListEvent) {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") return;
      setThemeState(e.matches ? "dark" : "light");
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "light" || e.newValue === "dark") {
        setThemeState(e.newValue);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      persistTheme(next);
      return next;
    });
  };

  const setTheme = (next: Theme) => {
    persistTheme(next);
    setThemeState(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
