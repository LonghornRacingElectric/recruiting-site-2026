"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/firebase/auth";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";

export function LogoutButton() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, mutate } = useUser();

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sign out from Firebase
      await signOut();

      // Clear the session cookie
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      // Update SWR cache to reflect logged out state
      mutate({ user: null }, false);

      // Force a hard reload to clear all client state
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Don't show anything while loading to prevent flicker
  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <Link
        href="/auth/login"
        className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
      >
        Login
      </Link>
    );
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
    >
      Log Out
    </button>
  );
}

