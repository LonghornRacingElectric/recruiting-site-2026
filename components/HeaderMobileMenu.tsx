"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

export type MobileNavItem = { href: string; label: string };

export function HeaderMobileMenu({
  publicNav,
  adminNav,
  showApplyCta,
}: {
  publicNav: MobileNavItem[];
  adminNav: MobileNavItem[];
  showApplyCta: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the panel whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
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
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <>
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="lg:hidden fixed inset-0 top-16 z-40"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />

          {/* Panel */}
          <div
            className="lg:hidden fixed left-0 right-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto"
            style={{
              background: "var(--admin-nav-bg, rgba(3, 6, 8, 0.98))",
              backdropFilter: "blur(16px) saturate(1.4)",
              WebkitBackdropFilter: "blur(16px) saturate(1.4)",
              borderBottom: "1px solid var(--admin-nav-border, rgba(255, 255, 255, 0.06))",
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
                    style={{ backgroundColor: "var(--admin-nav-border, rgba(255,255,255,0.08))" }}
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
                    backgroundColor: "var(--lhr-gold)",
                    color: "#000",
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
      className="px-3 py-2.5 rounded-md text-[14px] font-medium tracking-wide transition-colors duration-150"
      style={{
        color: isActive
          ? "var(--lhr-gold)"
          : "var(--admin-text-secondary, rgba(255,255,255,0.7))",
        backgroundColor: isActive
          ? "rgba(255,181,38,0.06)"
          : "transparent",
      }}
    >
      {children}
    </Link>
  );
}
