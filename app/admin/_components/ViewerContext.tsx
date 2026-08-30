"use client";

import { createContext, useContext, ReactNode } from "react";

/**
 * The signed-in staff member's uid, handed down from the admin layout's
 * server-side guard so client components know who is viewing before any
 * fetch resolves (the admin applications cache is keyed by it — #71).
 */
const ViewerContext = createContext<string | null>(null);

export function ViewerProvider({ uid, children }: { uid: string | null; children: ReactNode }) {
  return <ViewerContext.Provider value={uid}>{children}</ViewerContext.Provider>;
}

export function useViewerUid(): string | null {
  return useContext(ViewerContext);
}
