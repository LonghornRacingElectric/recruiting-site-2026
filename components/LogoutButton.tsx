"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/firebase/auth";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { useState, useRef, useEffect } from "react";
import { User, LogOut, LayoutDashboard } from "lucide-react";
import { UserRole } from "@/lib/models/User";

export function LogoutButton() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, mutate } = useUser();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signOut();
      await fetch("/api/auth/logout", { method: "POST" });
      mutate({ user: null }, false);
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <Link
        href="/auth/login"
        className="px-4 py-1.5 text-[13px] font-medium tracking-wide text-white/50 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
      >
        Login
      </Link>
    );
  }

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.TEAM_CAPTAIN_OB || user?.role === UserRole.REVIEWER;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium tracking-wide text-white/50 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/[0.04]"
      >
        <User className="h-4 w-4" />
        <span className="hidden sm:inline max-w-[120px] truncate">{user?.name || 'Account'}</span>
      </button>

      {showMenu && (
        <div
          className="absolute right-0 mt-2 w-56 rounded-lg py-2 z-50 overflow-hidden"
          style={{
            backgroundColor: '#0c1218',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div className="px-4 py-2 border-bottom border-white/5 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[13px] font-semibold text-white truncate">{user?.name || 'User'}</p>
            <p className="text-[11px] text-white/40 truncate">{user?.email}</p>
          </div>
          
          <Link
            href="/dashboard"
            className="w-full px-4 py-2 text-[13px] font-medium text-left text-white/40 hover:text-white/70 hover:bg-white/[0.04] flex items-center gap-2.5 transition-colors duration-150"
            onClick={() => setShowMenu(false)}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dashboard
          </Link>

          {isAdmin && (
            <Link
              href="/admin/dashboard"
              className="w-full px-4 py-2 text-[13px] font-medium text-left text-white/40 hover:text-white/70 hover:bg-white/[0.04] flex items-center gap-2.5 transition-colors duration-150"
              onClick={() => setShowMenu(false)}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Admin Portal
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-[13px] font-medium text-left text-white/40 hover:text-white/70 hover:bg-white/[0.04] flex items-center gap-2.5 transition-colors duration-150"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

