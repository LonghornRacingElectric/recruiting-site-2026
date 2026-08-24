"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useHeaderUi } from "./HeaderUi";

export type SiteMenuLink = { href: string; label: string };

/**
 * Desktop "Site" dropdown for staff: the public pages fold in here so the
 * admin links get the inline nav row. Shares HeaderUi so only one header
 * panel (this, the profile menu, the hamburger) is ever open at a time.
 */
export function HeaderSiteMenu({ links }: { links: SiteMenuLink[] }) {
  const { openPanel, setOpenPanel } = useHeaderUi();
  const open = openPanel === "site";
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close whenever the route changes.
  useEffect(() => {
    if (open) setOpenPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Click outside or Escape closes; Escape also returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenPanel(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenPanel(null);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpenPanel]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenPanel(open ? null : "site")}
        className={`relative flex items-center gap-1 px-3.5 py-1.5 text-[15px] font-semibold transition-colors duration-200 rounded-md cursor-pointer hover:text-[var(--pub-heading)] hover:bg-[var(--pub-surface-2)] ${
          open ? "text-[var(--pub-heading)] bg-[var(--pub-surface-2)]" : "text-[var(--pub-text-2)]"
        }`}
      >
        Site
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-48 rounded-lg py-2 z-50 overflow-hidden animate-fade-slide-down"
          style={{
            backgroundColor: "var(--pub-menu-bg)",
            border: "1px solid var(--pub-menu-border)",
            boxShadow: "var(--pub-shadow)",
          }}
        >
          {links.map((link) => {
            const isActive =
              link.href === "/" ? pathname === "/" : (pathname?.startsWith(link.href) ?? false);
            return (
              <Link
                key={link.href}
                href={link.href}
                role="menuitem"
                onClick={() => setOpenPanel(null)}
                className={`block px-4 py-2 text-[13px] font-medium transition-colors duration-150 hover:bg-[var(--pub-surface-2)] ${
                  isActive ? "" : "text-[var(--pub-text-2)] hover:text-[var(--pub-heading)]"
                }`}
                style={isActive ? { color: "var(--status-warn-ink)" } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
