import Link from "next/link";
import { getFaqConfig } from "@/lib/firebase/config";
import { routes } from "@/lib/routes";
import FaqAccordion from "./FaqAccordion";

// Server component: FAQ content comes straight from Firestore and renders in
// the initial HTML. The accordion interaction lives in FaqAccordion (client).

export default async function FaqPage() {
  const config = await getFaqConfig();
  const items = config.items ?? [];

  return (
    <main className="min-h-screen pt-24 pb-20 relative">
      {/* Background */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, rgba(4,95,133,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(255,181,38,0.04) 0%, transparent 40%), #030608",
        }}
      />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Header */}
        <p
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
          style={{ color: "var(--lhr-gray-blue)" }}
        >
          Questions & Answers
        </p>
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">
          Frequently asked questions
        </h1>
        <p className="font-urbanist text-[15px] leading-relaxed mb-10" style={{ color: "var(--lhr-gray-blue)" }}>
          Everything we get asked most often about joining Longhorn Racing.
        </p>

        {/* Questions */}
        {items.length === 0 ? (
          <div
            className="p-6 rounded-xl font-urbanist text-[14px]"
            style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--lhr-gray-blue)" }}
          >
            No questions have been published yet — check back soon.
          </div>
        ) : (
          <FaqAccordion items={items} />
        )}

        {/* CTA */}
        <div
          className="mt-12 p-7 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <h2 className="text-[15px] font-semibold text-white mb-1">Still have a question?</h2>
            <p className="font-urbanist text-[13px]" style={{ color: "var(--lhr-gray-blue)" }}>
              Reach out and we&apos;ll get back to you.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              href="/contact"
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              Contact us
            </Link>
            <Link
              href={routes.apply}
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ backgroundColor: "var(--lhr-gold)", color: "#000" }}
            >
              Apply
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
