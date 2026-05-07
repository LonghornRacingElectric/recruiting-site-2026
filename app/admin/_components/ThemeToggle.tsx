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
        backgroundColor: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.4)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
        e.currentTarget.style.color = "rgba(255,255,255,0.7)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
        e.currentTarget.style.color = "rgba(255,255,255,0.4)";
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
