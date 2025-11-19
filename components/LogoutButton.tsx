"use client";
import { useRouter } from "next/navigation";
import { signOut, onAuthStateChanged } from "@/lib/firebase/auth";
import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import Link from "next/link";

export function LogoutButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Sign out
      await signOut();

      // Clear the session cookie
      await fetch("/api/auth/logout", {
        method: "POST",
      });

      // Force a hard reload to clear all client state
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (!user) {
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
