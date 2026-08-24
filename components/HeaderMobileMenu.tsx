"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useHeaderUi } from "./HeaderUi";

export type MobileNavItem = { href: string; label: string };

export function HeaderMobileMenu({
  publicNav,
  adminNav,
  showApplyCta,
  desktopBreakpoint = "lg",
}: {
  publicNav: MobileNavItem[];
  adminNav: MobileNavItem[];
  showApplyCta: boolean;
  /** Breakpoint at which the inline desktop nav takes over (staff need xl). */
  desktopBreakpoint?: "lg" | "xl";
}) {
  // Full literals so Tailwind's scanner generates both variants.
  const hiddenAtDesktop = desktopBreakpoint === "xl" ? "xl:hidden" : "lg:hidden";
  const { openPanel, setOpenPanel } = useHeaderUi();
  const open = openPanel === "menu";
  const setOpen = (next: boolean) => setOpenPanel(next ? "menu" : null);
  const pathname = usePathname();

  // Close the panel whenever the route changes.
  useEffect(() => {
    if (open) setOpenPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll while the menu is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${hiddenAtDesktop} w-9 h-9 rounded-md flex items-center justify-center text-[var(--pub-text-2)] hover:text-[var(--pub-heading)] hover:bg-[var(--pub-surface-2)] transition-colors duration-200 cursor-pointer`}
      >
        <span className="relative w-[18px] h-[18px] block" aria-hidden="true">
          <Menu
            className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-200 ${
              open ? "opacity-0 rotate-90 scale-75" : "opacity-100 rotate-0 scale-100"
            }`}
          />
          <X
            className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-200 ${
              open ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75"
            }`}
          />
        </span>
      </button>

      {open && (
        <>
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className={`${hiddenAtDesktop} fixed inset-0 top-16 z-40 animate-fade-in`}
            style={{ backgroundColor: "var(--pub-scrim)", animationDuration: "0.15s" }}
          />

          {/* Panel */}
          <div
            className={`${hiddenAtDesktop} fixed left-0 right-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto animate-fade-slide-down`}
            style={{
              background: "var(--pub-menu-bg)",
              backdropFilter: "blur(20px) saturate(1.4)",
              WebkitBackdropFilter: "blur(20px) saturate(1.4)",
              borderBottom: "1px solid var(--pub-menu-border)",
              boxShadow: "var(--pub-shadow)",
            }}
          >
            <nav className="px-4 py-4 flex flex-col gap-0.5">
              {publicNav.map((link) => (
                <MobileLink key={link.href} href={link.href} pathname={pathname}>
                  {link.label}
                </MobileLink>
              ))}

              {adminNav.length > 0 && (
                <>
                  <div
                    className="my-2 mx-3 h-px"
                    style={{ backgroundColor: "var(--pub-border)" }}
                    aria-hidden="true"
                  />
                  {adminNav.map((item) => (
                    <MobileLink key={item.href} href={item.href} pathname={pathname}>
                      {item.label}
                    </MobileLink>
                  ))}
                </>
              )}

              {showApplyCta && (
                <Link
                  href="/apply"
                  className="mt-3 h-11 rounded-lg flex items-center justify-center text-[14px] font-semibold tracking-wide"
                  style={{
                    backgroundColor: "var(--pub-cta)",
                    color: "var(--pub-cta-ink)",
                  }}
                >
                  Apply
                </Link>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

function MobileLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string | null;
  children: React.ReactNode;
}) {
  const isActive =
    href === "/"
      ? pathname === "/"
      : pathname?.startsWith(href) ?? false;

  return (
    <Link
      href={href}
      className="px-3 py-2.5 rounded-md text-[15px] font-semibold transition-colors duration-150"
      style={{
        color: isActive ? "var(--status-warn-ink)" : "var(--pub-text)",
        backgroundColor: isActive ? "var(--status-warn-bg)" : "transparent",
      }}
    >
      {children}
    </Link>
  );
}
