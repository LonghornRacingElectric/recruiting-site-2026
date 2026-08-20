"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  // The icon is swapped by CSS ([data-theme] theme-icon-* rules) rather than
  // by React state: server HTML doesn't know the theme, and rendering it from
  // state caused a hydration mismatch on pages whose default differs from
  // the SSR assumption. Ghost styling matches the header nav links.
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      className="relative w-9 h-9 rounded-md flex items-center justify-center text-[var(--pub-text-2)] hover:text-[var(--pub-heading)] hover:bg-[var(--pub-surface-2)] transition-colors duration-200 cursor-pointer"
    >
      <Sun className="theme-icon-sun absolute h-[18px] w-[18px]" aria-hidden="true" />
      <Moon className="theme-icon-moon absolute h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
