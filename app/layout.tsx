import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToastProvider from "@/components/ToastProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  metadataBase: new URL("https://lhrrecruiting.org"),
  title: {
    default: "Longhorn Racing Recruiting",
    template: "%s | Longhorn Racing",
  },
  description:
    "Apply to Longhorn Racing — UT Austin's Formula SAE Electric, Solar, and Combustion racing teams. No experience required, all majors welcome.",
  icons: {
    icon: "/logo.png",
  },
  openGraph: {
    siteName: "Longhorn Racing Recruiting",
    type: "website",
    url: "https://lhrrecruiting.org",
    title: "Longhorn Racing Recruiting",
    description:
      "Apply to Longhorn Racing — UT Austin's Formula SAE Electric, Solar, and Combustion racing teams.",
    images: [{ url: "/logo.png" }],
  },
  twitter: {
    card: "summary",
    title: "Longhorn Racing Recruiting",
    description:
      "Apply to Longhorn Racing — UT Austin's Formula SAE Electric, Solar, and Combustion racing teams.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script runs synchronously before the browser paints the first
  // frame so the saved theme is applied before any paint — no flash.
  // A stored preference always wins; otherwise follow the system color
  // scheme, falling back to light when there is none. Keep in sync with
  // ThemeProvider.readStoredTheme.
  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('lhr_theme');
        var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        var theme = stored === 'light' || stored === 'dark' ? stored : system;
        document.documentElement.setAttribute('data-theme', theme);
      } catch (_) {}
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.png" sizes="any" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
