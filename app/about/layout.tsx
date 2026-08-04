import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Who we are, what we build, and why students join Longhorn Racing — UT Austin's Formula SAE racing organization.",
  alternates: { canonical: "/about" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
