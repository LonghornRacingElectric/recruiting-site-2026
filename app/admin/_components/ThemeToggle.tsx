"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  // The icon is swapped by CSS ([data-theme] show-on-* rules) rather than by
  // React state: server HTML doesn't know the theme, and rendering it from
  // state caused a hydration mismatch on pages whose default differs from
  // the SSR assumption.
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200"
      style={{
        backgroundColor: "var(--pub-surface-2)",
        color: "var(--pub-text-3)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--pub-text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--pub-text-3)";
      }}
    >
      <Sun className="h-4 w-4 show-on-dark" aria-hidden="true" />
      <Moon className="h-4 w-4 show-on-light" aria-hidden="true" />
    </button>
  );
}
