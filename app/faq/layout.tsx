import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to the questions we hear most from applicants — experience, time commitment, interviews, and who gets to drive.",
  alternates: { canonical: "/faq" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
