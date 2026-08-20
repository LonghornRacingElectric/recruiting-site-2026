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
      <div className="pub-page-bg" />

      <div className="container mx-auto px-6 md:px-10 max-w-3xl">
        {/* Header */}
        <p
          className="text-xs font-semibold tracking-[0.3em] uppercase mb-4"
          style={{ color: "var(--pub-text-3)" }}
        >
          Questions & Answers
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "var(--pub-heading)" }}>
          Frequently asked questions
        </h1>
        <p className="font-urbanist text-[15px] leading-relaxed mb-10" style={{ color: "var(--pub-text-2)" }}>
          Everything we get asked most often about joining Longhorn Racing.
        </p>

        {/* Questions */}
        {items.length === 0 ? (
          <div
            className="p-6 rounded-xl font-urbanist text-[14px]"
            style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)", color: "var(--pub-text-2)" }}
          >
            No questions have been published yet — check back soon.
          </div>
        ) : (
          <FaqAccordion items={items} />
        )}

        {/* CTA */}
        <div
          className="mt-12 p-7 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{ backgroundColor: "var(--pub-surface)", border: "1px solid var(--pub-border)" }}
        >
          <div>
            <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--pub-heading)" }}>Still have a question?</h2>
            <p className="font-urbanist text-[13px]" style={{ color: "var(--pub-text-2)" }}>
              Reach out and we&apos;ll get back to you.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              href="/contact"
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{
                backgroundColor: "var(--pub-surface-2)",
                border: "1px solid var(--pub-border-strong)",
                color: "var(--pub-text)",
              }}
            >
              Contact us
            </Link>
            <Link
              href={routes.apply}
              className="inline-flex items-center h-10 px-5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{ backgroundColor: "var(--pub-cta)", color: "var(--pub-cta-ink)" }}
            >
              Apply
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
