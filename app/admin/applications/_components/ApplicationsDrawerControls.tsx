"use client";

import {
  useApplicationsLayout,
  useCloseApplicationsDrawer,
} from "./ApplicationsLayoutContext";

/**
 * Mobile-only scrim that overlays the layout while a drawer is open and
 * closes the drawer on tap. The chevron handles themselves live inside
 * each sidebar so they ride along with the drawer's translate-x.
 */
export function ApplicationsDrawerControls() {
  const { openDrawer } = useApplicationsLayout();
  const close = useCloseApplicationsDrawer();

  if (!openDrawer) return null;

  return (
    <button
      type="button"
      aria-label="Close drawer"
      onClick={close}
      className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-30 animate-fade-in"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        animationDuration: "0.15s",
      }}
    />
  );
}
