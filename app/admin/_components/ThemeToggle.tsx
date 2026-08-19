"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
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
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
