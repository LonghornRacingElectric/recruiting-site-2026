import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToastProvider from "@/components/ToastProvider";
import PublicShell from "@/components/PublicShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Longhorn Racing | Recruiting",
  description: "Join the premier racing teams at UT Austin.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script runs synchronously before the browser paints the first
  // frame. It only applies a theme when the user is on an admin route, so
  // the applicant portal always renders in dark mode (requirement 3.5).
  // It also strips a stale attribute on route changes where the stored
  // theme hasn't been committed yet.
  const themeScript = `
    (function() {
      try {
        if (!window.location.pathname.startsWith('/admin')) return;
        var stored = localStorage.getItem('lhr_theme');
        if (stored === 'light' || stored === 'dark') {
          document.documentElement.setAttribute('data-theme', stored);
        }
      } catch (_) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <link rel="icon" href="/icon.png" sizes="any" />
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black text-white`}
      >
        <PublicShell header={<Header />} footer={<Footer />}>
          {children}
        </PublicShell>
        <ToastProvider />
      </body>
    </html>
  );
}
