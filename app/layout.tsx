import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToastProvider from "@/components/ToastProvider";
import PublicShell from "@/components/PublicShell";
import { ThemeProvider } from "@/app/admin/_components/ThemeProvider";

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
  // frame so the saved theme is applied before any paint — no flash.
  // Defaults to dark when no preference has been stored yet.
  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('lhr_theme');
        var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <link rel="icon" href="/icon.png" sizes="any" />
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
      >
        <ThemeProvider>
          <PublicShell header={<Header />} footer={<Footer />}>
            {children}
          </PublicShell>
          <ToastProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
