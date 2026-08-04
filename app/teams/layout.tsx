import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Teams",
  description: "Explore Longhorn Racing's three teams — Electric (LHRe), Solar (LHRs), and Combustion (LHRc) — and the systems you can join.",
  alternates: { canonical: "/teams" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
