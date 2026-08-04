import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Longhorn Racing at UT Austin.",
  alternates: { canonical: "/contact" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
