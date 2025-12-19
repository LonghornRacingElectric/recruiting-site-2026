"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, User } from "lucide-react";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Applicants", href: "/admin/applications" },
    { label: "Users", href: "/admin/users" },
    { label: "Teams", href: "/admin/teams" },
    { label: "Interviews", href: "/admin/interviews" },
    { label: "Scorecards", href: "/admin/scorecards" },
    { label: "Settings", href: "/admin/settings" },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-red-500/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/admin/applications" className="flex items-center gap-2">
               {/* Logo placeholder */}
               <div className="h-6 w-6 bg-orange-500 rounded-sm skew-x-[-10deg]"></div>
               <span className="font-bold text-lg tracking-tight">Longhorn Racing Admin</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              {navItems.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium transition-colors ${
                      isActive
                        ? "text-orange-500"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Search applicants..."
                className="h-9 w-64 rounded-md bg-neutral-900 border border-white/10 pl-9 pr-4 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
              />
            </div>
            <button className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 hover:bg-orange-500/20 transition-colors">
                <User className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
