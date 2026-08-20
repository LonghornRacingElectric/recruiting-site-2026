"use client";

import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { signInWithGoogle, signOut } from "@/lib/firebase/auth";
import { useState, useEffect } from "react";
import { UserRole } from "@/lib/models/User";
import LogoLockup from "@/components/LogoLockup";
import Link from "next/link";
import posthog from "posthog-js";

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
        posthog.identify(userCred.user.uid, {
          email: userCred.user.email ?? undefined,
          name: userCred.user.displayName ?? undefined,
          role: data.role,
        });

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
          background: 'radial-gradient(ellipse at 50% 0%, var(--pub-glow-1) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, var(--pub-glow-2) 0%, transparent 40%), var(--pub-bg)',
        }}
      />

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
            backgroundColor: 'var(--pub-surface)',
            border: '1px solid var(--pub-border)',
            boxShadow: 'var(--pub-shadow)',
          }}
        >
          {/* Top stripe bar */}
          <div className="flex h-1">
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-gold-light)' }} />
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-gold)' }} />
            <div className="flex-1" style={{ backgroundColor: 'var(--lhr-orange)' }} />
          </div>

          <div className="px-8 pt-10 pb-9">
            {/* Logo lockup — full color on light, white variant on dark */}
            <div className={`flex justify-center mb-8 ${mounted ? 'animate-fade-slide-up delay-100' : 'opacity-0'}`}>
              <LogoLockup size="md" />
            </div>

            {/* Heading */}
            <div className={`text-center mb-8 ${mounted ? 'animate-fade-slide-up delay-200' : 'opacity-0'}`}>
              <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--pub-heading)' }}>
                Sign in
              </h1>
              <p className="font-urbanist text-[14px]" style={{ color: 'var(--pub-text-2)' }}>
                Access your dashboard or start an application
              </p>
            </div>

            {/* Error — URLs in the message (e.g. the UTMail signup link) render
                as clickable anchors, not plain text */}
            {error && (
              <div
                className="mb-6 px-4 py-3 rounded-lg text-[13px] text-center"
                style={{
                  backgroundColor: 'var(--status-error-bg)',
                  border: '1px solid var(--status-error-border)',
                  color: 'var(--status-error-ink)',
                }}
              >
                {error.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a
                      key={i}
                      href={part}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline break-all hover:opacity-80 transition-opacity"
                    >
                      {part}
                    </a>
                  ) : (
                    part
                  )
                )}
              </div>
            )}

            {/* Sign in button */}
            <div className={`${mounted ? 'animate-fade-slide-up delay-300' : 'opacity-0'}`}>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="group w-full flex items-center justify-center gap-3 h-12 px-6 rounded-lg font-semibold text-[14px] tracking-wide transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--pub-surface-2)',
                  border: '1px solid var(--pub-border)',
                  color: 'var(--pub-text-strong)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.borderColor = 'var(--pub-border-strong)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--pub-border)';
                }}
              >
                {loading ? (
                  <svg
                    className="animate-spin h-4 w-4"
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
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--pub-border)' }} />
                <span className="font-urbanist text-[11px] tracking-widest uppercase" style={{ color: 'var(--pub-text-3)' }}>
                  Longhorn Racing
                </span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--pub-border)' }} />
              </div>
              <p className="font-urbanist text-[12px] text-center leading-relaxed" style={{ color: 'var(--pub-text-3)' }}>
                Sign in with your UT Google account (@utexas.edu).
                New applicants will be registered automatically.
              </p>
              <p className="font-urbanist text-[12px] text-center leading-relaxed mt-2" style={{ color: 'var(--pub-text-3)' }}>
                Don&apos;t have a UTMail account?{' '}
                <a
                  href="https://get.utmail.utexas.edu/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transition-colors duration-200 hover:opacity-80"
                  style={{ color: 'var(--pub-link)' }}
                >
                  Set one up here
                </a>
                .
              </p>
              <p className="font-urbanist text-[11px] text-center leading-relaxed mt-3" style={{ color: 'var(--pub-text-3)' }}>
                By signing in, you agree to our{' '}
                <Link href="/terms" className="underline transition-colors duration-200 hover:opacity-80" style={{ color: 'var(--pub-link)' }}>Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="underline transition-colors duration-200 hover:opacity-80" style={{ color: 'var(--pub-link)' }}>Privacy Policy</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
