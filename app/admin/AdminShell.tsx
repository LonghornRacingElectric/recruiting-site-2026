"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { signOut } from "@/lib/firebase/auth";

const navItems = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Applicants", href: "/admin/applications" },
  { label: "Users", href: "/admin/users" },
  { label: "Teams", href: "/admin/teams" },
  { label: "Configuration", href: "/admin/configuration" },
  { label: "Settings", href: "/admin/settings" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen text-white font-sans" style={{ background: '#030608' }}>
      {/* Top Navigation */}
      <header
        className="sticky top-0 z-50 transition-colors duration-300"
        style={{
          background: 'rgba(3, 6, 8, 0.8)',
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="flex h-16 items-center justify-between px-6 md:px-10 max-w-[1600px] mx-auto">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-8">
            <Link href="/admin/dashboard" className="flex items-center gap-3 shrink-0">
              <Image
                src="/logo.png"
                alt="Longhorn Racing"
                width={100}
                height={32}
                className="h-7 w-auto"
              />
              <span
                className="text-[11px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded"
                style={{
                  color: 'var(--lhr-blue-light)',
                  backgroundColor: 'rgba(4,95,133,0.12)',
                  border: '1px solid rgba(4,95,133,0.2)',
                }}
              >
                Admin
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-0.5">
              {navItems.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative px-3.5 py-1.5 text-[13px] font-medium tracking-wide rounded-md transition-colors duration-200"
                    style={{
                      color: isActive ? 'var(--lhr-gold)' : 'rgba(255,255,255,0.4)',
                      backgroundColor: isActive ? 'rgba(255,181,38,0.06)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: User menu */}
          <div className="flex items-center gap-3">
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200"
                style={{
                  backgroundColor: showUserMenu ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  color: showUserMenu ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                }}
                onMouseLeave={(e) => {
                  if (!showUserMenu) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
                  }
                }}
              >
                <User className="h-4 w-4" />
              </button>

              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-44 rounded-lg py-1 z-50"
                  style={{
                    backgroundColor: '#0c1218',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  }}
                >
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2.5 text-[13px] font-medium text-left text-white/40 hover:text-white/70 hover:bg-white/[0.04] flex items-center gap-2.5 transition-colors duration-150"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
