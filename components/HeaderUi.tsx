"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Panel = "menu" | "profile" | null;

interface HeaderUiContextValue {
  openPanel: Panel;
  setOpenPanel: (panel: Panel) => void;
}

const HeaderUiContext = createContext<HeaderUiContextValue | null>(null);

export function HeaderUiProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  return (
    <HeaderUiContext.Provider value={{ openPanel, setOpenPanel }}>
      {children}
    </HeaderUiContext.Provider>
  );
}

export function useHeaderUi(): HeaderUiContextValue {
  const ctx = useContext(HeaderUiContext);
  if (!ctx) {
    throw new Error("useHeaderUi must be used inside HeaderUiProvider");
  }
  return ctx;
}
