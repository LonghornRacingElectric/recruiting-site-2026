"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
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

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer so the first client render already reflects the saved
  // preference. (SSR output will be "dark", but `suppressHydrationWarning`
  // on <html> plus the inline script in RootLayout keeps DOM in sync so
  // users never see a flash.)
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const didMount = useRef(false);

  // Apply `data-theme` on every change. Persist to localStorage only after
  // the first render so the initial mount can't clobber a saved value.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (didMount.current) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Ignore quota / privacy-mode errors.
      }
    } else {
      didMount.current = true;
    }
  }, [theme]);

  // When the provider unmounts (e.g. user navigates from /admin to the
  // applicant portal), clear the attribute so light-mode styles don't leak.
  // Requirement 3.5: applicant portal always renders in dark mode.
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.removeAttribute("data-theme");
      }
    };
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
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const setTheme = (next: Theme) => {
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
