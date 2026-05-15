"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Drawer = "list" | "actions" | null;

interface ApplicationsLayoutContextValue {
  openDrawer: Drawer;
  setOpenDrawer: (drawer: Drawer) => void;
  hasSelection: boolean;
}

const ApplicationsLayoutContext =
  createContext<ApplicationsLayoutContextValue | null>(null);

export function ApplicationsLayoutProvider({
  children,
  hasSelection,
}: {
  children: ReactNode;
  hasSelection: boolean;
}) {
  const [openDrawer, setOpenDrawer] = useState<Drawer>(null);

  // Auto-open the list whenever we land on a no-selection state. Closes when
  // an applicant is selected. Has no visual effect on lg+ since both sidebars
  // are static columns there — drawer state is only consulted by the mobile
  // drawer wrappers.
  useEffect(() => {
    if (!hasSelection) {
      setOpenDrawer("list");
    } else {
      setOpenDrawer(null);
    }
  }, [hasSelection]);

  // Lock body scroll while a drawer is open.
  useEffect(() => {
    if (!openDrawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [openDrawer]);

  // Close on Escape.
  useEffect(() => {
    if (!openDrawer) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDrawer(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openDrawer]);

  return (
    <ApplicationsLayoutContext.Provider
      value={{ openDrawer, setOpenDrawer, hasSelection }}
    >
      {children}
    </ApplicationsLayoutContext.Provider>
  );
}

export function useApplicationsLayout(): ApplicationsLayoutContextValue {
  const ctx = useContext(ApplicationsLayoutContext);
  if (!ctx) {
    throw new Error(
      "useApplicationsLayout must be used inside ApplicationsLayoutProvider"
    );
  }
  return ctx;
}

// Convenience hook for the close action used by edge handles + scrim.
export function useCloseApplicationsDrawer() {
  const { setOpenDrawer } = useApplicationsLayout();
  return useCallback(() => setOpenDrawer(null), [setOpenDrawer]);
}
