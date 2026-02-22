"use client";

import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { signInWithGoogle, signOut } from "@/lib/firebase/auth";
import { useState, useEffect } from "react";
import { UserRole } from "@/lib/models/User";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const userCred = await signInWithGoogle();
      const idToken = await userCred.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect based on role - staff roles go to admin dashboard
        const staffRoles = [
          UserRole.ADMIN,
          UserRole.TEAM_CAPTAIN_OB,
          UserRole.SYSTEM_LEAD,
          UserRole.REVIEWER
        ];

        if (staffRoles.includes(data.role)) {
           window.location.href = "/admin/dashboard";
        } else {
           window.location.href = "/dashboard";
        }
      } else {
        console.error("Login failed:", data.error);
        setError(data.error || "Login failed");
        await signOut(); // Sign out from client SDK if session creation failed
        setLoading(false);
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(4,95,133,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(255,181,38,0.06) 0%, transparent 40%), #030608',
        }}
      />

      {/* Noise overlay */}
      <div className="absolute inset-0 noise-overlay" />

      {/* Card */}
      <div
        className={`relative w-full max-w-sm transition-all duration-700 ${
          mounted ? 'animate-scale-in' : 'opacity-0'
        }`}
      >
        {/* Card container */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Top stripe bar */}
          <div className="flex h-1">
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>

          <div className="px-8 pt-10 pb-9">
            {/* Logo */}
            <div className={`flex justify-center mb-8 ${mounted ? 'animate-fade-slide-up delay-100' : 'opacity-0'}`}>
              <Image
                src="/logo.png"
                alt="Longhorn Racing"
                width={140}
                height={46}
                className="h-10 w-auto"
              />
            </div>

            {/* Heading */}
            <div className={`text-center mb-8 ${mounted ? 'animate-fade-slide-up delay-200' : 'opacity-0'}`}>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                Sign in
              </h1>
              <p className="font-urbanist text-[14px] text-white/40">
                Access your dashboard or start an application
              </p>
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-6 px-4 py-3 rounded-lg text-[13px] text-center"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  color: '#f87171',
                }}
              >
                {error}
              </div>
            )}

            {/* Sign in button */}
            <div className={`${mounted ? 'animate-fade-slide-up delay-300' : 'opacity-0'}`}>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="group w-full flex items-center justify-center gap-3 h-12 px-6 rounded-lg font-semibold text-[14px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4 text-white/60"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt=""
                    className="w-4 h-4"
                  />
                )}
                {loading ? "Signing in..." : "Continue with Google"}
              </button>
            </div>

            {/* Divider + note */}
            <div className={`mt-8 ${mounted ? 'animate-fade-slide-up delay-400' : 'opacity-0'}`}>
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
                <span className="font-urbanist text-[11px] tracking-widest uppercase text-white/20">
                  Longhorn Racing
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
              </div>
              <p className="font-urbanist text-[12px] text-white/20 text-center leading-relaxed">
                Use your university Google account to sign in.
                New applicants will be registered automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
